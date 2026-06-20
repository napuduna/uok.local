import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseClient } from "@warehouse/database";

import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "inventory adjustment integration",
  () => {
    let application: INestApplication;
    let database: DatabaseClient;
    let productId: string;
    let adminCookie: string;
    let salesCookie: string;

    async function createLot(
      referenceNumber: string,
      lotNumber: string,
      quantity: number
    ): Promise<string> {
      const response = await request(application.getHttpServer())
        .post("/api/v1/stock-ins")
        .set("cookie", adminCookie)
        .set("idempotency-key", `stock-in-${referenceNumber}`)
        .send({
          referenceNumber,
          receivedAt: "2026-06-15T00:00:00.000Z",
          items: [
            {
              productId,
              lotNumber,
              expiryDate: null,
              quantity,
              unitCost: "20.00"
            }
          ]
        })
        .expect(201);

      return response.body.items[0].lotId as string;
    }

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();
      application = module.createNestApplication();
      application.setGlobalPrefix("api/v1");
      await application.init();
      database = application.get(DatabaseService).client;

      const [category, unit, admin, salesRole] = await Promise.all([
        database.category.findUniqueOrThrow({ where: { code: "GENERAL" } }),
        database.unit.findUniqueOrThrow({ where: { code: "PCS" } }),
        database.user.findUniqueOrThrow({
          where: { email: "admin@uok.local" }
        }),
        database.role.findUniqueOrThrow({ where: { name: "SALES" } })
      ]);
      const product = await database.product.create({
        data: {
          code: "P-ADJUSTMENT-INTEGRATION",
          name: "สินค้าทดสอบปรับสต๊อก",
          categoryId: category.id,
          unitId: unit.id,
          salePrice: "50.00"
        }
      });
      productId = product.id;
      await database.user.create({
        data: {
          email: "sales.adjustment@uok.local",
          name: "Adjustment Sales",
          passwordHash: admin.passwordHash,
          roleId: salesRole.id
        }
      });

      const adminLogin = await request(application.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "admin@uok.local", password: "ChangeMe123!" })
        .expect(200);
      const salesLogin = await request(application.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email: "sales.adjustment@uok.local",
          password: "ChangeMe123!"
        })
        .expect(200);
      adminCookie = adminLogin.get("set-cookie")?.[0] ?? "";
      salesCookie = salesLogin.get("set-cookie")?.[0] ?? "";
    });

    afterAll(async () => {
      await application.close();
    });

    it("rejects an excessive decrease and creates one idempotent adjustment", async () => {
      const lotId = await createLot(
        "SI-ADJUSTMENT-001",
        "LOT-ADJUSTMENT-001",
        10
      );
      const payload = {
        referenceNumber: "ADJ-INTEGRATION-001",
        lotId,
        direction: "DECREASE",
        quantity: 4,
        reason: "สินค้าชำรุด"
      };

      await request(application.getHttpServer())
        .post("/api/v1/adjustments")
        .set("cookie", adminCookie)
        .set("idempotency-key", "adjustment-excessive")
        .send({ ...payload, quantity: 11 })
        .expect(409);
      await expect(
        database.lot.findUniqueOrThrow({
          where: { id: lotId },
          select: { availableQuantity: true }
        })
      ).resolves.toEqual({ availableQuantity: 10 });

      const created = await request(application.getHttpServer())
        .post("/api/v1/adjustments")
        .set("cookie", adminCookie)
        .set("idempotency-key", "adjustment-idempotent")
        .send(payload)
        .expect(201);
      expect(created.body).toMatchObject({
        referenceNumber: payload.referenceNumber,
        direction: "DECREASE",
        quantity: 4,
        quantityDelta: -4,
        beforeQuantity: 10,
        afterQuantity: 6,
        reason: payload.reason
      });

      const retried = await request(application.getHttpServer())
        .post("/api/v1/adjustments")
        .set("cookie", adminCookie)
        .set("idempotency-key", "adjustment-idempotent")
        .send(payload)
        .expect(201);
      expect(retried.body.id).toBe(created.body.id);

      const [lot, movements, audits] = await Promise.all([
        database.lot.findUniqueOrThrow({
          where: { id: lotId },
          select: { availableQuantity: true }
        }),
        database.inventoryMovement.count({
          where: {
            lotId,
            referenceType: "INVENTORY_ADJUSTMENT"
          }
        }),
        database.auditLog.count({
          where: {
            action: "INVENTORY_ADJUSTED",
            resourceId: created.body.id as string
          }
        })
      ]);
      expect({ lot, movements, audits }).toEqual({
        lot: { availableQuantity: 6 },
        movements: 1,
        audits: 1
      });
    });

    it("locks the lot so parallel decreases cannot make stock negative", async () => {
      const lotId = await createLot(
        "SI-ADJUSTMENT-CONCURRENT",
        "LOT-ADJUSTMENT-CONCURRENT",
        10
      );
      const createDecrease = (suffix: string) =>
        request(application.getHttpServer())
          .post("/api/v1/adjustments")
          .set("cookie", adminCookie)
          .set("idempotency-key", `adjustment-concurrent-${suffix}`)
          .send({
            referenceNumber: `ADJ-CONCURRENT-${suffix}`,
            lotId,
            direction: "DECREASE",
            quantity: 7,
            reason: "ทดสอบการขายพร้อมกัน"
          });

      const responses = await Promise.all([
        createDecrease("A"),
        createDecrease("B")
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409
      ]);
      await expect(
        database.lot.findUniqueOrThrow({
          where: { id: lotId },
          select: { availableQuantity: true }
        })
      ).resolves.toEqual({ availableQuantity: 3 });
      await expect(
        database.inventoryMovement.count({
          where: {
            lotId,
            referenceType: "INVENTORY_ADJUSTMENT"
          }
        })
      ).resolves.toBe(1);
    });

    it("rejects adjustment mutations from sales users", async () => {
      const lotId = await createLot(
        "SI-ADJUSTMENT-RBAC",
        "LOT-ADJUSTMENT-RBAC",
        5
      );

      await request(application.getHttpServer())
        .post("/api/v1/adjustments")
        .set("cookie", salesCookie)
        .set("idempotency-key", "adjustment-sales-denied")
        .send({
          referenceNumber: "ADJ-SALES-DENIED",
          lotId,
          direction: "INCREASE",
          quantity: 1,
          reason: "ทดสอบสิทธิ์"
        })
        .expect(403);
    });
  }
);
