import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseClient } from "@warehouse/database";

import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "stock-in integration",
  () => {
    let application: INestApplication;
    let database: DatabaseClient;
    let productId: string;
    const productCode = "P-STOCK-IN-INTEGRATION";
    const idempotencyKey = "stock-in-integration-key";

    async function adminCookie(): Promise<string> {
      const response = await request(application.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "admin@uok.local", password: "ChangeMe123!" })
        .expect(200);
      const cookie = response.get("set-cookie")?.[0];
      if (!cookie) throw new Error("Login did not set a session cookie");
      return cookie;
    }

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();
      application = module.createNestApplication();
      application.setGlobalPrefix("api/v1");
      await application.init();
      database = application.get(DatabaseService).client;

      const [category, unit] = await Promise.all([
        database.category.findUniqueOrThrow({ where: { code: "GENERAL" } }),
        database.unit.findUniqueOrThrow({ where: { code: "PCS" } })
      ]);
      const product = await database.product.create({
        data: {
          code: productCode,
          name: "สินค้าทดสอบรับเข้า",
          categoryId: category.id,
          unitId: unit.id,
          salePrice: "50.00"
        }
      });
      productId = product.id;
    });

    afterAll(async () => {
      await application.close();
    });

    it("creates lot, movement and audit once for idempotent retries", async () => {
      const cookie = await adminCookie();
      const payload = {
        referenceNumber: "SI-INTEGRATION-001",
        receivedAt: "2026-06-15T00:00:00.000Z",
        items: [
          {
            productId,
            lotNumber: "LOT-STOCK-IN-001",
            expiryDate: "2027-06-15T00:00:00.000Z",
            quantity: 300,
            unitCost: "20.00"
          }
        ]
      };

      const created = await request(application.getHttpServer())
        .post("/api/v1/stock-ins")
        .set("cookie", cookie)
        .set("idempotency-key", idempotencyKey)
        .send(payload)
        .expect(201);
      expect(created.body).toMatchObject({
        referenceNumber: "SI-INTEGRATION-001",
        items: [
          {
            lotNumber: "LOT-STOCK-IN-001",
            quantity: 300,
            availableQuantity: 300,
            unitCost: "20.00"
          }
        ]
      });

      const retried = await request(application.getHttpServer())
        .post("/api/v1/stock-ins")
        .set("cookie", cookie)
        .set("idempotency-key", idempotencyKey)
        .send(payload)
        .expect(201);
      expect(retried.body.id).toBe(created.body.id);

      const [lots, movements, audits, stockIns] = await Promise.all([
        database.lot.count({ where: { productId } }),
        database.inventoryMovement.count({
          where: { referenceId: created.body.id as string }
        }),
        database.auditLog.count({
          where: {
            action: "STOCK_IN_CREATED",
            resourceId: created.body.id as string
          }
        }),
        database.stockIn.count({ where: { idempotencyKey } })
      ]);
      expect({ lots, movements, audits, stockIns }).toEqual({
        lots: 1,
        movements: 1,
        audits: 1,
        stockIns: 1
      });

      await request(application.getHttpServer())
        .post("/api/v1/stock-ins")
        .set("cookie", cookie)
        .set("idempotency-key", idempotencyKey)
        .send({
          ...payload,
          items: [{ ...payload.items[0], quantity: 301 }]
        })
        .expect(409);
    });
  }
);
