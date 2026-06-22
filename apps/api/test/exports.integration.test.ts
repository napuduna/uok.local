import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Queue } from "bullmq";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { exportSnapshotSchema } from "@warehouse/contracts";
import { Prisma, type DatabaseClient } from "@warehouse/database";

import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "exports integration",
  () => {
    let application: INestApplication;
    let database: DatabaseClient;
    let queue: Queue;
    let artifactDirectory: string;
    let adminCookie: string;
    let salesCookie: string;
    let warehouseCookie: string;
    let salesUserId: string;

    beforeAll(async () => {
      artifactDirectory = await mkdtemp(join(tmpdir(), "warehouse-exports-"));
      process.env.EXPORT_ARTIFACT_DIR = artifactDirectory;

      const module = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();
      application = module.createNestApplication();
      application.setGlobalPrefix("api/v1");
      await application.init();
      database = application.get(DatabaseService).client;

      const redisUrl = new URL(process.env.REDIS_URL!);
      queue = new Queue("warehouse-exports", {
        connection: {
          host: redisUrl.hostname,
          port: Number(redisUrl.port || 6379),
          ...(redisUrl.password ? { password: redisUrl.password } : {})
        }
      });
      await queue.drain(true);

      const [admin, salesRole, warehouseRole, warehouse, category, unit] =
        await Promise.all([
          database.user.findUniqueOrThrow({
            where: { email: "admin@uok.local" }
          }),
          database.role.findUniqueOrThrow({ where: { name: "SALES" } }),
          database.role.findUniqueOrThrow({ where: { name: "WAREHOUSE" } }),
          database.warehouse.findFirstOrThrow({
            where: { isDefault: true, isActive: true }
          }),
          database.category.findUniqueOrThrow({ where: { code: "GENERAL" } }),
          database.unit.findUniqueOrThrow({ where: { code: "PCS" } })
        ]);
      const [salesUser, warehouseUser] = await Promise.all([
        database.user.create({
          data: {
            email: "sales.exports@uok.local",
            name: "Export Sales",
            passwordHash: admin.passwordHash,
            roleId: salesRole.id
          }
        }),
        database.user.create({
          data: {
            email: "warehouse.exports@uok.local",
            name: "Export Warehouse",
            passwordHash: admin.passwordHash,
            roleId: warehouseRole.id
          }
        })
      ]);
      salesUserId = salesUser.id;

      const login = async (email: string) => {
        const response = await request(application.getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password: "ChangeMe123!" })
          .expect(200);
        return response.get("set-cookie")?.[0] ?? "";
      };
      [adminCookie, salesCookie, warehouseCookie] = await Promise.all([
        login(admin.email),
        login(salesUser.email),
        login(warehouseUser.email)
      ]);

      const [product, adminCustomer, salesCustomer] = await Promise.all([
        database.product.create({
          data: {
            code: "EXPORT-P001",
            name: "Export Product",
            categoryId: category.id,
            unitId: unit.id,
            salePrice: "50.00",
            lowStockThreshold: 10
          }
        }),
        database.customer.create({
          data: {
            code: "EXPORT-C001",
            firstName: "Admin",
            lastName: "Export",
            age: 30,
            gender: "UNSPECIFIED",
            address: "",
            phone: "",
            phoneNormalized: "",
            joinedAt: new Date("2026-03-01T00:00:00.000Z")
          }
        }),
        database.customer.create({
          data: {
            code: "EXPORT-C002",
            firstName: "Sales",
            lastName: "Export",
            age: 31,
            gender: "UNSPECIFIED",
            address: "",
            phone: "",
            phoneNormalized: "",
            joinedAt: new Date("2026-03-01T00:00:00.000Z")
          }
        })
      ]);
      await database.lot.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          lotNumber: "EXPORT-LOT",
          receivedAt: new Date("2026-01-01T00:00:00.000Z"),
          unitCost: "20.00",
          receivedQuantity: 25,
          availableQuantity: 25
        }
      });

      const createSale = (input: {
        invoiceNumber: string;
        customerId: string;
        createdById: string;
        totalSales: string;
      }) =>
        database.sale.create({
          data: {
            invoiceNumber: input.invoiceNumber,
            customerId: input.customerId,
            warehouseId: warehouse.id,
            soldAt: new Date("2026-03-01T05:00:00.000Z"),
            totalSales: input.totalSales,
            totalCost: "40.00",
            grossProfit: new Prisma.Decimal(input.totalSales).sub(40),
            idempotencyKey: randomUUID(),
            requestHash: randomUUID(),
            createdById: input.createdById,
            items: {
              create: {
                productId: product.id,
                quantity: 2,
                unitPrice: new Prisma.Decimal(input.totalSales).div(2),
                salesSubtotal: input.totalSales,
                costSubtotal: "40.00",
                grossProfit: new Prisma.Decimal(input.totalSales).sub(40)
              }
            }
          }
        });
      await Promise.all([
        createSale({
          invoiceNumber: "EXPORT-INV-001",
          customerId: adminCustomer.id,
          createdById: admin.id,
          totalSales: "100.00"
        }),
        createSale({
          invoiceNumber: "EXPORT-INV-002",
          customerId: salesCustomer.id,
          createdById: salesUser.id,
          totalSales: "200.00"
        })
      ]);
    });

    afterAll(async () => {
      await queue.drain(true);
      await queue.close();
      await application.close();
      await rm(artifactDirectory, { recursive: true, force: true });
    });

    it("persists and queues one idempotent export snapshot", async () => {
      const input = {
        reportType: "SALES",
        format: "XLSX",
        filters: {
          dateFrom: "2026-03-01",
          dateTo: "2026-03-01",
          groupBy: "day"
        }
      };
      const first = await request(application.getHttpServer())
        .post("/api/v1/exports")
        .set("cookie", adminCookie)
        .set("idempotency-key", "export-admin-sales")
        .send(input)
        .expect(201);
      const retry = await request(application.getHttpServer())
        .post("/api/v1/exports")
        .set("cookie", adminCookie)
        .set("idempotency-key", "export-admin-sales")
        .send(input)
        .expect(201);

      expect(retry.body.id).toBe(first.body.id);
      expect(
        await database.exportJob.count({
          where: { idempotencyKey: "export-admin-sales" }
        })
      ).toBe(1);
      expect(await queue.getJob(first.body.id)).not.toBeNull();

      const persisted = await database.exportJob.findUniqueOrThrow({
        where: { id: first.body.id }
      });
      const snapshot = exportSnapshotSchema.parse(persisted.snapshot);
      expect(snapshot.totals).toMatchObject({
        invoiceCount: 2,
        totalSales: "300.00"
      });

      await request(application.getHttpServer())
        .post("/api/v1/exports")
        .set("cookie", adminCookie)
        .set("idempotency-key", "export-admin-sales")
        .send({ ...input, format: "PDF" })
        .expect(409);
    });

    it("returns one job for concurrent idempotent export requests", async () => {
      const idempotencyKey = `export-concurrent-${randomUUID()}`;
      const input = {
        reportType: "INVENTORY_CURRENT",
        format: "XLSX",
        filters: {}
      };
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(application.getHttpServer())
            .post("/api/v1/exports")
            .set("cookie", adminCookie)
            .set("idempotency-key", idempotencyKey)
            .send(input)
        )
      );

      expect(responses.map((response) => response.status)).toEqual([
        201, 201, 201, 201
      ]);
      const responseIds = responses.map(
        (response) => (response.body as { id: string }).id
      );
      expect(new Set(responseIds).size).toBe(1);
      expect(
        await database.exportJob.count({
          where: { idempotencyKey }
        })
      ).toBe(1);
    });

    it("applies own-sales scope before persisting the snapshot", async () => {
      const response = await request(application.getHttpServer())
        .post("/api/v1/exports")
        .set("cookie", salesCookie)
        .set("idempotency-key", "export-sales-own")
        .send({
          reportType: "GROSS_PROFIT",
          format: "PDF",
          filters: {
            dateFrom: "2026-03-01",
            dateTo: "2026-03-01",
            groupBy: "day"
          }
        })
        .expect(201);
      const persisted = await database.exportJob.findUniqueOrThrow({
        where: { id: response.body.id }
      });
      const snapshot = exportSnapshotSchema.parse(persisted.snapshot);

      expect(persisted.requesterId).toBe(salesUserId);
      expect(snapshot.totals).toEqual({
        totalSales: "200.00",
        totalCost: "40.00",
        grossProfit: "160.00"
      });
    });

    it("enforces stock and sales export permissions at the API", async () => {
      await request(application.getHttpServer())
        .post("/api/v1/exports")
        .set("cookie", warehouseCookie)
        .set("idempotency-key", "export-warehouse-sales-denied")
        .send({
          reportType: "SALES",
          format: "XLSX",
          filters: {
            dateFrom: "2026-03-01",
            dateTo: "2026-03-01",
            groupBy: "day"
          }
        })
        .expect(403);

      await request(application.getHttpServer())
        .post("/api/v1/exports")
        .set("cookie", warehouseCookie)
        .set("idempotency-key", "export-warehouse-stock")
        .send({
          reportType: "INVENTORY_CURRENT",
          format: "XLSX",
          filters: {}
        })
        .expect(201);

      await request(application.getHttpServer())
        .post("/api/v1/exports")
        .set("cookie", salesCookie)
        .set("idempotency-key", "export-sales-stock-denied")
        .send({
          reportType: "INVENTORY_CURRENT",
          format: "XLSX",
          filters: {}
        })
        .expect(403);
    });

    it("restricts artifact download to an authorized requester", async () => {
      const job = await database.exportJob.findUniqueOrThrow({
        where: { idempotencyKey: "export-admin-sales" }
      });
      const fileName = `${job.id}.xlsx`;
      const artifactData = "export-content";
      await writeFile(join(artifactDirectory, fileName), artifactData);
      await database.exportJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          artifactPath: fileName,
          fileName: "sales-report.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          checksum: createHash("sha256").update(artifactData).digest("hex"),
          sizeBytes: Buffer.byteLength(artifactData),
          expiresAt: new Date(Date.now() + 60_000),
          completedAt: new Date()
        }
      });

      await request(application.getHttpServer())
        .get(`/api/v1/exports/${job.id}/download`)
        .set("cookie", salesCookie)
        .expect(404);

      const download = await request(application.getHttpServer())
        .get(`/api/v1/exports/${job.id}/download`)
        .set("cookie", adminCookie)
        .expect(200);
      expect(download.headers["content-disposition"]).toContain(
        "sales-report.xlsx"
      );
      expect(download.text).toBe("export-content");
    });
  }
);
