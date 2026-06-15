import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseClient } from "@warehouse/database";

import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "inventory integration",
  () => {
    let application: INestApplication;
    let database: DatabaseClient;
    let productId: string;
    let warehouseId: string;
    let lotId: string;
    let actorId: string;
    const productCode = "P-INVENTORY-INTEGRATION";

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

      const existing = await database.product.findUnique({
        where: { code: productCode }
      });
      if (existing) {
        await database.lot.deleteMany({ where: { productId: existing.id } });
        await database.product.delete({ where: { id: existing.id } });
      }

      const [category, unit, warehouse, actor] = await Promise.all([
        database.category.findUniqueOrThrow({ where: { code: "GENERAL" } }),
        database.unit.findUniqueOrThrow({ where: { code: "PCS" } }),
        database.warehouse.findUniqueOrThrow({ where: { code: "MAIN" } }),
        database.user.findUniqueOrThrow({
          where: { email: "admin@uok.local" }
        })
      ]);
      const product = await database.product.create({
        data: {
          code: productCode,
          name: "สินค้าทดสอบ Inventory",
          categoryId: category.id,
          unitId: unit.id,
          salePrice: "50.00"
        }
      });
      const lot = await database.lot.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          lotNumber: "LOT-INTEGRATION",
          receivedAt: new Date("2026-06-15T00:00:00.000Z"),
          unitCost: "20.00",
          receivedQuantity: 10,
          availableQuantity: 0
        }
      });

      productId = product.id;
      warehouseId = warehouse.id;
      lotId = lot.id;
      actorId = actor.id;
    });

    afterAll(async () => {
      await database.lot.deleteMany({ where: { productId } });
      await database.product.deleteMany({ where: { id: productId } });
      await application.close();
    });

    it("returns deterministic stock, lot and reconciliation views", async () => {
      const cookie = await adminCookie();
      const stock = await request(application.getHttpServer())
        .get(`/api/v1/products/${productId}/stock`)
        .set("cookie", cookie)
        .expect(200);
      expect(stock.body).toMatchObject({
        totalAvailable: 0,
        activeLotCount: 1
      });

      const lots = await request(application.getHttpServer())
        .get(`/api/v1/products/${productId}/lots`)
        .set("cookie", cookie)
        .expect(200);
      expect(lots.body).toMatchObject({
        total: 1,
        items: [
          {
            lotNumber: "LOT-INTEGRATION",
            received: 0,
            sold: 0,
            adjusted: 0,
            availableQuantity: 0
          }
        ]
      });

      const reconciliation = await request(application.getHttpServer())
        .get(
          `/api/v1/products/${productId}/reconciliation?warehouseId=${warehouseId}`
        )
        .set("cookie", cookie)
        .expect(200);
      expect(reconciliation.body).toMatchObject({
        isBalanced: true,
        items: [{ lotNumber: "LOT-INTEGRATION", difference: 0 }]
      });
    });

    it("blocks product archive while stock remains", async () => {
      const cookie = await adminCookie();
      await database.lot.update({
        where: { id: lotId },
        data: { availableQuantity: 1 }
      });

      const response = await request(application.getHttpServer())
        .patch(`/api/v1/products/${productId}/archive`)
        .set("cookie", cookie)
        .expect(409);
      expect(response.body).toMatchObject({
        code: "PRODUCT_HAS_AVAILABLE_STOCK"
      });

      await database.lot.update({
        where: { id: lotId },
        data: { availableQuantity: 0 }
      });
    });

    it("enforces the append-only movement trigger for update and delete", async () => {
      const movementData = {
        type: "STOCK_IN" as const,
        quantityDelta: 10,
        lotId,
        warehouseId,
        actorId,
        referenceType: "INTEGRATION_TEST",
        referenceId: "immutable-ledger"
      };

      await expect(
        database.$transaction(async (transaction) => {
          const movement = await transaction.inventoryMovement.create({
            data: movementData
          });
          await transaction.inventoryMovement.update({
            where: { id: movement.id },
            data: { quantityDelta: 11 }
          });
        })
      ).rejects.toThrow(/append-only/);

      await expect(
        database.$transaction(async (transaction) => {
          const movement = await transaction.inventoryMovement.create({
            data: movementData
          });
          await transaction.inventoryMovement.delete({
            where: { id: movement.id }
          });
        })
      ).rejects.toThrow(/append-only/);

      await expect(
        database.inventoryMovement.count({
          where: { referenceId: "immutable-ledger" }
        })
      ).resolves.toBe(0);
    });
  }
);
