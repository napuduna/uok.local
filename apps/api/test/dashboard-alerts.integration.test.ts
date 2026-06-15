import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseClient } from "@warehouse/database";

import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "dashboard inventory alerts integration",
  () => {
    let application: INestApplication;
    let database: DatabaseClient;
    let cookie: string;
    let warehouseId: string;
    let categoryId: string;
    let unitId: string;

    const now = new Date();
    const daysFromNow = (days: number) =>
      new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    async function createProduct(
      code: string,
      options: { threshold?: number; isActive?: boolean } = {}
    ) {
      return database.product.create({
        data: {
          code,
          name: code,
          categoryId,
          unitId,
          salePrice: "50.00",
          lowStockThreshold: options.threshold ?? 50,
          isActive: options.isActive ?? true
        }
      });
    }

    async function createLot(options: {
      productId: string;
      lotNumber: string;
      quantity: number;
      expiryDate?: Date | null;
      isActive?: boolean;
    }) {
      return database.lot.create({
        data: {
          productId: options.productId,
          warehouseId,
          lotNumber: options.lotNumber,
          receivedAt: daysFromNow(-60),
          expiryDate: options.expiryDate ?? null,
          unitCost: "20.00",
          receivedQuantity: options.quantity,
          availableQuantity: options.quantity,
          isActive: options.isActive ?? true
        }
      });
    }

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();
      application = module.createNestApplication();
      application.setGlobalPrefix("api/v1");
      await application.init();
      database = application.get(DatabaseService).client;

      const [warehouse, category, unit] = await Promise.all([
        database.warehouse.findFirstOrThrow({
          where: { isDefault: true, isActive: true }
        }),
        database.category.findUniqueOrThrow({ where: { code: "GENERAL" } }),
        database.unit.findUniqueOrThrow({ where: { code: "PCS" } })
      ]);
      warehouseId = warehouse.id;
      categoryId = category.id;
      unitId = unit.id;

      const login = await request(application.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "admin@uok.local", password: "ChangeMe123!" })
        .expect(200);
      cookie = login.get("set-cookie")?.[0] ?? "";

      const [low, enough, zero, archived, expiry] = await Promise.all([
        createProduct("ALERT-LOW"),
        createProduct("ALERT-ENOUGH"),
        createProduct("ALERT-ZERO"),
        createProduct("ALERT-ARCHIVED", { isActive: false }),
        createProduct("ALERT-EXPIRY", { threshold: 0 })
      ]);

      await Promise.all([
        createLot({
          productId: low.id,
          lotNumber: "ALERT-LOW-A",
          quantity: 20
        }),
        createLot({
          productId: low.id,
          lotNumber: "ALERT-LOW-B",
          quantity: 10
        }),
        createLot({
          productId: low.id,
          lotNumber: "ALERT-LOW-ARCHIVED",
          quantity: 100,
          isActive: false
        }),
        createLot({
          productId: enough.id,
          lotNumber: "ALERT-ENOUGH-A",
          quantity: 60
        }),
        createLot({
          productId: archived.id,
          lotNumber: "ALERT-PRODUCT-ARCHIVED",
          quantity: 1
        }),
        createLot({
          productId: expiry.id,
          lotNumber: "ALERT-EXPIRED",
          quantity: 5,
          expiryDate: daysFromNow(-1)
        }),
        createLot({
          productId: expiry.id,
          lotNumber: "ALERT-EXPIRING",
          quantity: 6,
          expiryDate: daysFromNow(10)
        }),
        createLot({
          productId: expiry.id,
          lotNumber: "ALERT-FUTURE",
          quantity: 7,
          expiryDate: daysFromNow(60)
        }),
        createLot({
          productId: expiry.id,
          lotNumber: "ALERT-EXPIRY-ARCHIVED",
          quantity: 8,
          expiryDate: daysFromNow(-2),
          isActive: false
        })
      ]);

      expect(zero.id).toBeTruthy();
    });

    afterAll(async () => {
      await application.close();
    });

    it("aggregates active lot stock in the default warehouse", async () => {
      const response = await request(application.getHttpServer())
        .get("/api/v1/dashboard/alerts/low-stock?page=1&pageSize=100")
        .set("cookie", cookie)
        .expect(200);

      const relevant = response.body.items.filter(
        (item: { product: { code: string } }) =>
          item.product.code.startsWith("ALERT-")
      );
      expect(relevant).toEqual([
        expect.objectContaining({
          product: expect.objectContaining({ code: "ALERT-ZERO" }),
          totalAvailable: 0,
          lowStockThreshold: 50,
          shortage: 50
        }),
        expect.objectContaining({
          product: expect.objectContaining({ code: "ALERT-LOW" }),
          totalAvailable: 30,
          lowStockThreshold: 50,
          shortage: 20
        })
      ]);
    });

    it("filters expiry status and paginates deterministically", async () => {
      const expired = await request(application.getHttpServer())
        .get(
          "/api/v1/dashboard/alerts/expiry?status=expired&daysAhead=30&page=1&pageSize=1"
        )
        .set("cookie", cookie)
        .expect(200);
      expect(expired.body).toMatchObject({
        page: 1,
        pageSize: 1
      });
      expect(expired.body.items[0]).toMatchObject({
        lot: { lotNumber: "ALERT-EXPIRED" },
        status: "EXPIRED"
      });

      const expiring = await request(application.getHttpServer())
        .get(
          "/api/v1/dashboard/alerts/expiry?status=expiring&daysAhead=30&page=1&pageSize=100"
        )
        .set("cookie", cookie)
        .expect(200);
      expect(
        expiring.body.items.filter((item: { lot: { lotNumber: string } }) =>
          item.lot.lotNumber.startsWith("ALERT-")
        )
      ).toEqual([
        expect.objectContaining({
          lot: expect.objectContaining({ lotNumber: "ALERT-EXPIRING" }),
          status: "EXPIRING_SOON"
        })
      ]);
    });

    it("returns dashboard counts and preview lists", async () => {
      const response = await request(application.getHttpServer())
        .get("/api/v1/dashboard/alerts")
        .set("cookie", cookie)
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          lowStockCount: expect.any(Number),
          expiredLotCount: expect.any(Number),
          expiringSoonLotCount: expect.any(Number),
          lowStockItems: expect.any(Array),
          expiryItems: expect.any(Array)
        })
      );
    });
  }
);
