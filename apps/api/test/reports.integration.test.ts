import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma, type DatabaseClient } from "@warehouse/database";

import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "reports integration",
  () => {
    let application: INestApplication;
    let database: DatabaseClient;
    let adminCookie: string;
    let managerCookie: string;
    let salesCookie: string;
    let warehouseCookie: string;

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();
      application = module.createNestApplication();
      application.setGlobalPrefix("api/v1");
      await application.init();
      database = application.get(DatabaseService).client;

      const [admin, managerRole, salesRole, warehouseRole, warehouse, category, unit] =
        await Promise.all([
          database.user.findUniqueOrThrow({
            where: { email: "admin@uok.local" }
          }),
          database.role.findUniqueOrThrow({ where: { name: "MANAGER" } }),
          database.role.findUniqueOrThrow({ where: { name: "SALES" } }),
          database.role.findUniqueOrThrow({ where: { name: "WAREHOUSE" } }),
          database.warehouse.findFirstOrThrow({
            where: { isDefault: true, isActive: true }
          }),
          database.category.findUniqueOrThrow({ where: { code: "GENERAL" } }),
          database.unit.findUniqueOrThrow({ where: { code: "PCS" } })
        ]);

      const [manager, sales, warehouseUser] = await Promise.all([
        database.user.create({
          data: {
            email: "manager.reports@uok.local",
            name: "Report Manager",
            passwordHash: admin.passwordHash,
            roleId: managerRole.id
          }
        }),
        database.user.create({
          data: {
            email: "sales.reports@uok.local",
            name: "Report Sales",
            passwordHash: admin.passwordHash,
            roleId: salesRole.id
          }
        }),
        database.user.create({
          data: {
            email: "warehouse.reports@uok.local",
            name: "Report Warehouse",
            passwordHash: admin.passwordHash,
            roleId: warehouseRole.id
          }
        })
      ]);

      const login = async (email: string) => {
        const response = await request(application.getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password: "ChangeMe123!" })
          .expect(200);
        return response.get("set-cookie")?.[0] ?? "";
      };
      [adminCookie, managerCookie, salesCookie, warehouseCookie] =
        await Promise.all([
          login(admin.email),
          login(manager.email),
          login(sales.email),
          login(warehouseUser.email)
        ]);

      const [product, secondProduct] = await Promise.all([
        database.product.create({
          data: {
            code: "REPORT-P001",
            name: "Report Product One",
            categoryId: category.id,
            unitId: unit.id,
            salePrice: "50.00",
            lowStockThreshold: 10
          }
        }),
        database.product.create({
          data: {
            code: "REPORT-P002",
            name: "Report Product Two",
            categoryId: category.id,
            unitId: unit.id,
            salePrice: "80.00",
            lowStockThreshold: 5
          }
        })
      ]);

      await Promise.all([
        database.lot.create({
          data: {
            productId: product.id,
            warehouseId: warehouse.id,
            lotNumber: "REPORT-LOW",
            receivedAt: new Date("2026-01-01T00:00:00.000Z"),
            expiryDate: new Date("2099-02-10T00:00:00.000Z"),
            unitCost: "20.00",
            receivedQuantity: 5,
            availableQuantity: 5
          }
        }),
        database.lot.create({
          data: {
            productId: secondProduct.id,
            warehouseId: warehouse.id,
            lotNumber: "REPORT-STOCK",
            receivedAt: new Date("2026-01-02T00:00:00.000Z"),
            expiryDate: null,
            unitCost: "30.00",
            receivedQuantity: 20,
            availableQuantity: 20
          }
        })
      ]);

      const [adminCustomer, salesCustomer, cancelledCustomer] =
        await Promise.all([
          database.customer.create({
            data: {
              code: "REPORT-C001",
              firstName: "Admin",
              lastName: "Customer",
              age: 30,
              gender: "UNSPECIFIED",
              address: "",
              phone: "",
              phoneNormalized: "",
              joinedAt: new Date("2026-02-01T01:00:00.000Z")
            }
          }),
          database.customer.create({
            data: {
              code: "REPORT-C002",
              firstName: "Sales",
              lastName: "Customer",
              age: 31,
              gender: "UNSPECIFIED",
              address: "",
              phone: "",
              phoneNormalized: "",
              joinedAt: new Date("2026-02-02T01:00:00.000Z")
            }
          }),
          database.customer.create({
            data: {
              code: "REPORT-C003",
              firstName: "Cancelled",
              lastName: "Customer",
              age: 32,
              gender: "UNSPECIFIED",
              address: "",
              phone: "",
              phoneNormalized: "",
              joinedAt: new Date("2026-01-01T01:00:00.000Z")
            }
          })
        ]);

      const createSale = (input: {
        invoiceNumber: string;
        customerId: string;
        createdById: string;
        soldAt: Date;
        quantity: number;
        totalSales: string;
        totalCost: string;
        grossProfit: string;
        status?: "COMPLETED" | "CANCELLED";
      }) =>
        database.sale.create({
          data: {
            invoiceNumber: input.invoiceNumber,
            customerId: input.customerId,
            warehouseId: warehouse.id,
            status: input.status ?? "COMPLETED",
            soldAt: input.soldAt,
            totalSales: input.totalSales,
            totalCost: input.totalCost,
            grossProfit: input.grossProfit,
            idempotencyKey: randomUUID(),
            requestHash: randomUUID(),
            createdById: input.createdById,
            ...(input.status === "CANCELLED"
              ? {
                  cancelledAt: new Date("2026-02-01T11:00:00.000Z"),
                  cancellationReason: "Report fixture cancellation",
                  cancellationIdempotencyKey: randomUUID(),
                  cancellationRequestHash: randomUUID(),
                  cancelledById: input.createdById
                }
              : {}),
            items: {
              create: {
                productId: product.id,
                quantity: input.quantity,
                unitPrice: new Prisma.Decimal(input.totalSales).div(
                  input.quantity
                ),
                salesSubtotal: input.totalSales,
                costSubtotal: input.totalCost,
                grossProfit: input.grossProfit
              }
            }
          }
        });

      await Promise.all([
        createSale({
          invoiceNumber: "REPORT-INV-001",
          customerId: adminCustomer.id,
          createdById: admin.id,
          soldAt: new Date("2026-01-31T17:30:00.000Z"),
          quantity: 4,
          totalSales: "100.00",
          totalCost: "60.00",
          grossProfit: "40.00"
        }),
        createSale({
          invoiceNumber: "REPORT-INV-002",
          customerId: salesCustomer.id,
          createdById: sales.id,
          soldAt: new Date("2026-02-01T16:30:00.000Z"),
          quantity: 4,
          totalSales: "200.00",
          totalCost: "100.00",
          grossProfit: "100.00"
        }),
        createSale({
          invoiceNumber: "REPORT-INV-003",
          customerId: cancelledCustomer.id,
          createdById: admin.id,
          soldAt: new Date("2026-02-01T10:00:00.000Z"),
          quantity: 9,
          totalSales: "900.00",
          totalCost: "300.00",
          grossProfit: "600.00",
          status: "CANCELLED"
        }),
        createSale({
          invoiceNumber: "REPORT-INV-004",
          customerId: adminCustomer.id,
          createdById: admin.id,
          soldAt: new Date("2026-02-01T17:30:00.000Z"),
          quantity: 1,
          totalSales: "50.00",
          totalCost: "20.00",
          grossProfit: "30.00"
        })
      ]);
    });

    afterAll(async () => {
      await application.close();
    });

    it("groups completed sales by Bangkok business date and reconciles totals", async () => {
      const response = await request(application.getHttpServer())
        .get(
          "/api/v1/reports/sales?dateFrom=2026-02-01&dateTo=2026-02-01&groupBy=day&page=1&pageSize=25"
        )
        .set("cookie", adminCookie)
        .expect(200);

      expect(response.body).toEqual({
        items: [
          {
            period: "2026-02-01",
            invoiceCount: 2,
            quantitySold: 8,
            totalSales: "300.00"
          }
        ],
        page: 1,
        pageSize: 25,
        total: 1,
        totals: {
          invoiceCount: 2,
          quantitySold: 8,
          totalSales: "300.00"
        }
      });
    });

    it("groups by day, month and year with deterministic pagination", async () => {
      const fetchReport = (query: string) =>
        request(application.getHttpServer())
          .get(`/api/v1/reports/sales?${query}`)
          .set("cookie", adminCookie)
          .expect(200);
      const [firstDay, secondDay, monthly, yearly] = await Promise.all([
        fetchReport(
          "dateFrom=2026-02-01&dateTo=2026-02-02&groupBy=day&page=1&pageSize=1"
        ),
        fetchReport(
          "dateFrom=2026-02-01&dateTo=2026-02-02&groupBy=day&page=2&pageSize=1"
        ),
        fetchReport(
          "dateFrom=2026-02-01&dateTo=2026-02-02&groupBy=month"
        ),
        fetchReport(
          "dateFrom=2026-02-01&dateTo=2026-02-02&groupBy=year"
        )
      ]);

      expect(firstDay.body).toMatchObject({
        total: 2,
        items: [{ period: "2026-02-01" }]
      });
      expect(secondDay.body.items).toEqual([{ period: "2026-02-02", invoiceCount: 1, quantitySold: 1, totalSales: "50.00" }]);
      expect(monthly.body.items).toEqual([
        {
          period: "2026-02",
          invoiceCount: 3,
          quantitySold: 9,
          totalSales: "350.00"
        }
      ]);
      expect(yearly.body.items).toEqual([
        {
          period: "2026",
          invoiceCount: 3,
          quantitySold: 9,
          totalSales: "350.00"
        }
      ]);
    });

    it("scopes sales and gross profit to the current Sales user", async () => {
      const [sales, grossProfit] = await Promise.all([
        request(application.getHttpServer())
          .get(
            "/api/v1/reports/sales?dateFrom=2026-02-01&dateTo=2026-02-01"
          )
          .set("cookie", salesCookie)
          .expect(200),
        request(application.getHttpServer())
          .get(
            "/api/v1/reports/gross-profit?dateFrom=2026-02-01&dateTo=2026-02-01"
          )
          .set("cookie", salesCookie)
          .expect(200)
      ]);

      expect(sales.body.totals).toEqual({
        invoiceCount: 1,
        quantitySold: 4,
        totalSales: "200.00"
      });
      expect(grossProfit.body.totals).toEqual({
        totalSales: "200.00",
        totalCost: "100.00",
        grossProfit: "100.00"
      });
    });

    it("returns deterministic current, low-stock and expiry inventory reports", async () => {
      const [current, lowStock, expiry] = await Promise.all([
        request(application.getHttpServer())
          .get("/api/v1/reports/inventory/current?page=1&pageSize=100")
          .set("cookie", warehouseCookie)
          .expect(200),
        request(application.getHttpServer())
          .get("/api/v1/reports/inventory/low-stock?page=1&pageSize=100")
          .set("cookie", warehouseCookie)
          .expect(200),
        request(application.getHttpServer())
          .get(
            "/api/v1/reports/inventory/expiry?status=expired&asOf=2099-02-11&page=1&pageSize=100"
          )
          .set("cookie", warehouseCookie)
          .expect(200)
      ]);

      expect(
        current.body.items.filter(
          (item: { product: { code: string } }) =>
            item.product.code.startsWith("REPORT-")
        )
      ).toEqual([
        expect.objectContaining({
          product: expect.objectContaining({ code: "REPORT-P001" }),
          totalAvailable: 5,
          inventoryValue: "100.00"
        }),
        expect.objectContaining({
          product: expect.objectContaining({ code: "REPORT-P002" }),
          totalAvailable: 20,
          inventoryValue: "600.00"
        })
      ]);
      expect(
        lowStock.body.items.filter(
          (item: { product: { code: string } }) =>
            item.product.code.startsWith("REPORT-")
        )
      ).toEqual([
        expect.objectContaining({
          product: expect.objectContaining({ code: "REPORT-P001" }),
          shortage: 5
        })
      ]);
      expect(expiry.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            lot: expect.objectContaining({ lotNumber: "REPORT-LOW" }),
            status: "EXPIRED",
            inventoryValue: "100.00"
          })
        ])
      );

      for (const report of [current, lowStock, expiry]) {
        const quantity = report.body.items.reduce(
          (
            total: number,
            item: { totalAvailable?: number; availableQuantity?: number }
          ) =>
            total + (item.totalAvailable ?? item.availableQuantity ?? 0),
          0
        );
        const inventoryValue = report.body.items
          .reduce(
            (total: Prisma.Decimal, item: { inventoryValue: string }) =>
              total.add(item.inventoryValue),
            new Prisma.Decimal(0)
          )
          .toFixed(2);

        expect(report.body.total).toBe(report.body.items.length);
        expect(report.body.totals.quantity).toBe(quantity);
        expect(report.body.totals.inventoryValue).toBe(inventoryValue);
      }
    });

    it("returns role-scoped top customers and date-filtered new customers", async () => {
      const [adminTop, salesTop, newCustomers] = await Promise.all([
        request(application.getHttpServer())
          .get(
            "/api/v1/reports/customers/top?dateFrom=2026-02-01&dateTo=2026-02-01&page=1&pageSize=25"
          )
          .set("cookie", managerCookie)
          .expect(200),
        request(application.getHttpServer())
          .get(
            "/api/v1/reports/customers/top?dateFrom=2026-02-01&dateTo=2026-02-01&page=1&pageSize=25"
          )
          .set("cookie", salesCookie)
          .expect(200),
        request(application.getHttpServer())
          .get(
            "/api/v1/reports/customers/new?dateFrom=2026-02-01&dateTo=2026-02-02&page=1&pageSize=25"
          )
          .set("cookie", managerCookie)
          .expect(200)
      ]);

      expect(adminTop.body.items.map((item: { customer: { code: string } }) => item.customer.code)).toEqual([
        "REPORT-C002",
        "REPORT-C001"
      ]);
      expect(salesTop.body.items).toEqual([
        expect.objectContaining({
          customer: expect.objectContaining({ code: "REPORT-C002" }),
          invoiceCount: 1,
          quantitySold: 4,
          totalSales: "200.00"
        })
      ]);
      expect(
        newCustomers.body.items.map(
          (item: { customer: { code: string } }) => item.customer.code
        )
      ).toEqual(["REPORT-C002", "REPORT-C001"]);
    });

    it("denies report categories outside the role matrix", async () => {
      await request(application.getHttpServer())
        .get(
          "/api/v1/reports/sales?dateFrom=2026-02-01&dateTo=2026-02-01"
        )
        .set("cookie", warehouseCookie)
        .expect(403);

      await request(application.getHttpServer())
        .get("/api/v1/reports/inventory/current")
        .set("cookie", salesCookie)
        .expect(403);
    });
  }
);
