import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseClient } from "@warehouse/database";

import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "sales integration",
  () => {
    let application: INestApplication;
    let database: DatabaseClient;
    let adminCookie: string;
    let salesCookie: string;
    let warehouseCookie: string;
    let customerId: string;
    let categoryId: string;
    let unitId: string;
    let fifoSaleId: string;
    let fifoProductId: string;

    async function login(email: string): Promise<string> {
      const response = await request(application.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: "ChangeMe123!" })
        .expect(200);
      const cookie = response.get("set-cookie")?.[0];
      if (!cookie) throw new Error("Login did not set a session cookie");
      return cookie;
    }

    async function createProduct(code: string) {
      return database.product.create({
        data: {
          code,
          name: code,
          categoryId,
          unitId,
          salePrice: "30.00"
        }
      });
    }

    async function stockIn(options: {
      productId: string;
      reference: string;
      lotNumber: string;
      quantity: number;
      unitCost: string;
      receivedAt: string;
      expiryDate?: string | null;
    }) {
      return request(application.getHttpServer())
        .post("/api/v1/stock-ins")
        .set("cookie", adminCookie)
        .set("idempotency-key", `idem-${options.reference}`)
        .send({
          referenceNumber: options.reference,
          receivedAt: options.receivedAt,
          items: [
            {
              productId: options.productId,
              lotNumber: options.lotNumber,
              expiryDate: options.expiryDate ?? null,
              quantity: options.quantity,
              unitCost: options.unitCost
            }
          ]
        })
        .expect(201);
    }

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();
      application = module.createNestApplication();
      application.setGlobalPrefix("api/v1");
      await application.init();
      database = application.get(DatabaseService).client;

      const [admin, salesRole, warehouseRole, category, unit] =
        await Promise.all([
          database.user.findUniqueOrThrow({
            where: { email: "admin@uok.local" }
          }),
          database.role.findUniqueOrThrow({ where: { name: "SALES" } }),
          database.role.findUniqueOrThrow({ where: { name: "WAREHOUSE" } }),
          database.category.findUniqueOrThrow({ where: { code: "GENERAL" } }),
          database.unit.findUniqueOrThrow({ where: { code: "PCS" } })
        ]);
      categoryId = category.id;
      unitId = unit.id;

      await Promise.all([
        database.user.create({
          data: {
            email: "sales.transaction@uok.local",
            name: "Transaction Sales",
            passwordHash: admin.passwordHash,
            roleId: salesRole.id
          }
        }),
        database.user.create({
          data: {
            email: "warehouse.transaction@uok.local",
            name: "Transaction Warehouse",
            passwordHash: admin.passwordHash,
            roleId: warehouseRole.id
          }
        })
      ]);
      const customer = await database.customer.create({
        data: {
          code: "SALE-CUSTOMER",
          firstName: "ลูกค้า",
          lastName: "ทดสอบ",
          age: 30,
          gender: "UNSPECIFIED",
          address: "",
          phone: "081-000-0000",
          phoneNormalized: "0810000000",
          joinedAt: new Date()
        }
      });
      customerId = customer.id;

      adminCookie = await login("admin@uok.local");
      salesCookie = await login("sales.transaction@uok.local");
      warehouseCookie = await login("warehouse.transaction@uok.local");
    });

    afterAll(async () => {
      await application.close();
    });

    it("creates an idempotent FIFO sale with allocation cost snapshots", async () => {
      const product = await createProduct("SALE-FIFO");
      await stockIn({
        productId: product.id,
        reference: "SI-SALE-FIFO-001",
        lotNumber: "LOT001",
        quantity: 300,
        unitCost: "20.00",
        receivedAt: "2026-01-01T00:00:00.000Z"
      });
      await stockIn({
        productId: product.id,
        reference: "SI-SALE-FIFO-002",
        lotNumber: "LOT002",
        quantity: 1100,
        unitCost: "22.00",
        receivedAt: "2026-02-01T00:00:00.000Z"
      });
      const payload = {
        customerId,
        items: [{ productId: product.id, quantity: 500, unitPrice: "30.00" }]
      };

      const created = await request(application.getHttpServer())
        .post("/api/v1/sales")
        .set("cookie", salesCookie)
        .set("idempotency-key", "sale-fifo-idempotent")
        .send(payload)
        .expect(201);
      fifoSaleId = created.body.id as string;
      fifoProductId = product.id;
      expect(created.body).toMatchObject({
        invoiceNumber: expect.stringMatching(/^INV-\d{8}-\d{6}$/),
        status: "COMPLETED",
        totalSales: "15000.00",
        totalCost: "10400.00",
        grossProfit: "4600.00",
        items: [
          {
            quantity: 500,
            costSubtotal: "10400.00",
            allocations: [
              {
                lotNumber: "LOT001",
                quantity: 300,
                unitCost: "20.00",
                costSubtotal: "6000.00"
              },
              {
                lotNumber: "LOT002",
                quantity: 200,
                unitCost: "22.00",
                costSubtotal: "4400.00"
              }
            ]
          }
        ]
      });

      const retried = await request(application.getHttpServer())
        .post("/api/v1/sales")
        .set("cookie", salesCookie)
        .set("idempotency-key", "sale-fifo-idempotent")
        .send(payload)
        .expect(201);
      expect(retried.body.id).toBe(created.body.id);

      const [lots, movements, saleCount, auditCount] = await Promise.all([
        database.lot.findMany({
          where: { productId: product.id },
          orderBy: { lotNumber: "asc" },
          select: { lotNumber: true, availableQuantity: true }
        }),
        database.inventoryMovement.count({
          where: {
            referenceType: "SALE",
            referenceId: created.body.id as string
          }
        }),
        database.sale.count({
          where: { idempotencyKey: "sale-fifo-idempotent" }
        }),
        database.auditLog.count({
          where: {
            action: "SALE_CREATED",
            resourceId: created.body.id as string
          }
        })
      ]);
      expect(lots).toEqual([
        { lotNumber: "LOT001", availableQuantity: 0 },
        { lotNumber: "LOT002", availableQuantity: 900 }
      ]);
      expect({ movements, saleCount, auditCount }).toEqual({
        movements: 2,
        saleCount: 1,
        auditCount: 1
      });

      const catalog = await request(application.getHttpServer())
        .get("/api/v1/sales/catalog?search=SALE-FIFO")
        .set("cookie", salesCookie)
        .expect(200);
      expect(catalog.body).toMatchObject({
        total: 1,
        items: [
          {
            product: { id: product.id, code: "SALE-FIFO" },
            salePrice: "30.00",
            totalAvailable: 900
          }
        ]
      });

      const history = await request(application.getHttpServer())
        .get(`/api/v1/customers/${customerId}/purchase-history`)
        .set("cookie", salesCookie)
        .expect(200);
      expect(history.body).toMatchObject({
        summary: {
          orderCount: 1,
          totalSales: "15000.00",
          totalCost: "10400.00",
          grossProfit: "4600.00"
        },
        total: 1,
        items: [
          {
            saleId: created.body.id,
            invoiceNumber: created.body.invoiceNumber,
            status: "COMPLETED",
            itemCount: 1,
            totalSales: "15000.00",
            totalCost: "10400.00",
            grossProfit: "4600.00"
          }
        ]
      });
    });

    it("rolls back every item when one product has insufficient stock", async () => {
      const [enough, insufficient] = await Promise.all([
        createProduct("SALE-ROLLBACK-ENOUGH"),
        createProduct("SALE-ROLLBACK-SHORT")
      ]);
      await stockIn({
        productId: enough.id,
        reference: "SI-SALE-ROLLBACK-ENOUGH",
        lotNumber: "ROLLBACK-ENOUGH",
        quantity: 20,
        unitCost: "10.00",
        receivedAt: "2026-01-01T00:00:00.000Z"
      });
      await stockIn({
        productId: insufficient.id,
        reference: "SI-SALE-ROLLBACK-SHORT",
        lotNumber: "ROLLBACK-SHORT",
        quantity: 2,
        unitCost: "10.00",
        receivedAt: "2026-01-01T00:00:00.000Z"
      });

      await request(application.getHttpServer())
        .post("/api/v1/sales")
        .set("cookie", salesCookie)
        .set("idempotency-key", "sale-rollback")
        .send({
          customerId,
          items: [
            { productId: enough.id, quantity: 10, unitPrice: "20.00" },
            { productId: insufficient.id, quantity: 3, unitPrice: "20.00" }
          ]
        })
        .expect(409);

      await expect(
        database.lot.findMany({
          where: { productId: { in: [enough.id, insufficient.id] } },
          orderBy: { lotNumber: "asc" },
          select: { lotNumber: true, availableQuantity: true }
        })
      ).resolves.toEqual([
        { lotNumber: "ROLLBACK-ENOUGH", availableQuantity: 20 },
        { lotNumber: "ROLLBACK-SHORT", availableQuantity: 2 }
      ]);
    });

    it("locks lots so competing sales cannot oversell", async () => {
      const product = await createProduct("SALE-CONCURRENT");
      await stockIn({
        productId: product.id,
        reference: "SI-SALE-CONCURRENT",
        lotNumber: "CONCURRENT",
        quantity: 10,
        unitCost: "10.00",
        receivedAt: "2026-01-01T00:00:00.000Z"
      });
      const createSale = (suffix: string) =>
        request(application.getHttpServer())
          .post("/api/v1/sales")
          .set("cookie", salesCookie)
          .set("idempotency-key", `sale-concurrent-${suffix}`)
          .send({
            customerId,
            items: [
              { productId: product.id, quantity: 7, unitPrice: "20.00" }
            ]
          });

      const responses = await Promise.all([createSale("A"), createSale("B")]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409
      ]);
      await expect(
        database.lot.findFirstOrThrow({
          where: { productId: product.id },
          select: { availableQuantity: true }
        })
      ).resolves.toEqual({ availableQuantity: 3 });
    });

    it("rejects sale creation from warehouse users", async () => {
      await request(application.getHttpServer())
        .post("/api/v1/sales")
        .set("cookie", warehouseCookie)
        .set("idempotency-key", "sale-warehouse-denied")
        .send({
          customerId,
          items: [
            {
              productId: "00000000-0000-4000-8000-000000000000",
              quantity: 1,
              unitPrice: "1.00"
            }
          ]
        })
        .expect(403);
    });

    it("cancels a whole invoice and restores the exact original lots once", async () => {
      const cancelled = await request(application.getHttpServer())
        .post(`/api/v1/sales/${fifoSaleId}/cancel`)
        .set("cookie", salesCookie)
        .set("idempotency-key", "cancel-sale-fifo")
        .send({ reason: "ลูกค้าขอยกเลิกทั้งบิล" })
        .expect(201);
      expect(cancelled.body).toMatchObject({
        id: fifoSaleId,
        status: "CANCELLED",
        cancellationReason: "ลูกค้าขอยกเลิกทั้งบิล",
        totalCost: "10400.00",
        items: [
          {
            allocations: [
              { lotNumber: "LOT001", quantity: 300 },
              { lotNumber: "LOT002", quantity: 200 }
            ]
          }
        ]
      });

      const retried = await request(application.getHttpServer())
        .post(`/api/v1/sales/${fifoSaleId}/cancel`)
        .set("cookie", salesCookie)
        .set("idempotency-key", "cancel-sale-fifo")
        .send({ reason: "ลูกค้าขอยกเลิกทั้งบิล" })
        .expect(201);
      expect(retried.body.id).toBe(fifoSaleId);

      await request(application.getHttpServer())
        .post(`/api/v1/sales/${fifoSaleId}/cancel`)
        .set("cookie", salesCookie)
        .set("idempotency-key", "cancel-sale-fifo-again")
        .send({ reason: "ยกเลิกซ้ำ" })
        .expect(409);

      const [lots, cancellationMovements, auditCount] = await Promise.all([
        database.lot.findMany({
          where: { productId: fifoProductId },
          orderBy: { lotNumber: "asc" },
          select: { lotNumber: true, availableQuantity: true }
        }),
        database.inventoryMovement.count({
          where: {
            type: "SALE_CANCELLATION_IN",
            referenceType: "SALE",
            referenceId: fifoSaleId
          }
        }),
        database.auditLog.count({
          where: {
            action: "SALE_CANCELLED",
            resourceId: fifoSaleId
          }
        })
      ]);
      expect(lots).toEqual([
        { lotNumber: "LOT001", availableQuantity: 300 },
        { lotNumber: "LOT002", availableQuantity: 1100 }
      ]);
      expect({ cancellationMovements, auditCount }).toEqual({
        cancellationMovements: 2,
        auditCount: 1
      });

      await request(application.getHttpServer())
        .post(`/api/v1/sales/${fifoSaleId}/cancel`)
        .set("cookie", warehouseCookie)
        .set("idempotency-key", "cancel-sale-warehouse")
        .send({ reason: "ไม่มีสิทธิ์" })
        .expect(403);
    });

    it("limits Sales users to their own invoices and customer history", async () => {
      const product = await createProduct("SALE-OWN-VISIBILITY");
      await stockIn({
        productId: product.id,
        reference: "SI-SALE-OWN-VISIBILITY",
        lotNumber: "OWN-VISIBILITY",
        quantity: 5,
        unitCost: "10.00",
        receivedAt: "2026-01-01T00:00:00.000Z"
      });
      const created = await request(application.getHttpServer())
        .post("/api/v1/sales")
        .set("cookie", adminCookie)
        .set("idempotency-key", "sale-own-visibility")
        .send({
          customerId,
          items: [
            { productId: product.id, quantity: 1, unitPrice: "20.00" }
          ]
        })
        .expect(201);

      await request(application.getHttpServer())
        .post(`/api/v1/sales/${created.body.id as string}/cancel`)
        .set("cookie", salesCookie)
        .set("idempotency-key", "cancel-another-sales-invoice")
        .send({ reason: "ไม่ใช่บิลของตนเอง" })
        .expect(404);

      await request(application.getHttpServer())
        .get(`/api/v1/sales/${created.body.id as string}`)
        .set("cookie", salesCookie)
        .expect(404);

      const list = await request(application.getHttpServer())
        .get(
          `/api/v1/sales?invoiceNumber=${created.body.invoiceNumber as string}`
        )
        .set("cookie", salesCookie)
        .expect(200);
      expect(list.body).toMatchObject({ total: 0, items: [] });

      const history = await request(application.getHttpServer())
        .get(`/api/v1/customers/${customerId}/purchase-history`)
        .set("cookie", salesCookie)
        .expect(200);
      expect(history.body.items).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ saleId: created.body.id })
        ])
      );
    });
  }
);
