import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseClient } from "@warehouse/database";

import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "background exports integration",
  () => {
    let application: INestApplication;
    let database: DatabaseClient;
    let salesCookie: string;
    let otherSalesCookie: string;
    let managerCookie: string;
    let warehouseCookie: string;

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();
      application = module.createNestApplication();
      application.setGlobalPrefix("api/v1");
      await application.init();
      database = application.get(DatabaseService).client;

      const [admin, salesRole, managerRole, warehouseRole] =
        await Promise.all([
          database.user.findUniqueOrThrow({
            where: { email: "admin@uok.local" }
          }),
          database.role.findUniqueOrThrow({ where: { name: "SALES" } }),
          database.role.findUniqueOrThrow({ where: { name: "MANAGER" } }),
          database.role.findUniqueOrThrow({
            where: { name: "WAREHOUSE" }
          })
        ]);
      const suffix = randomUUID();
      const [sales, otherSales, manager, warehouse] = await Promise.all([
        database.user.create({
          data: {
            email: `sales.exports.${suffix}@uok.local`,
            name: "Export Sales",
            passwordHash: admin.passwordHash,
            roleId: salesRole.id
          }
        }),
        database.user.create({
          data: {
            email: `sales.other.exports.${suffix}@uok.local`,
            name: "Other Export Sales",
            passwordHash: admin.passwordHash,
            roleId: salesRole.id
          }
        }),
        database.user.create({
          data: {
            email: `manager.exports.${suffix}@uok.local`,
            name: "Export Manager",
            passwordHash: admin.passwordHash,
            roleId: managerRole.id
          }
        }),
        database.user.create({
          data: {
            email: `warehouse.exports.${suffix}@uok.local`,
            name: "Export Warehouse",
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
      [salesCookie, otherSalesCookie, managerCookie, warehouseCookie] =
        await Promise.all([
          login(sales.email),
          login(otherSales.email),
          login(manager.email),
          login(warehouse.email)
        ]);
    });

    afterAll(async () => {
      await application.close();
    });

    it("persists an auditable, role-scoped snapshot equal to the on-screen report", async () => {
      const filters = {
        dateFrom: "2099-01-01",
        dateTo: "2099-01-31",
        groupBy: "month"
      };
      const report = await request(application.getHttpServer())
        .get(
          "/api/v1/reports/sales?dateFrom=2099-01-01&dateTo=2099-01-31&groupBy=month&page=1&pageSize=100"
        )
        .set("cookie", salesCookie)
        .expect(200);
      const idempotencyKey = randomUUID();
      const created = await request(application.getHttpServer())
        .post("/api/v1/exports")
        .set("cookie", salesCookie)
        .set("idempotency-key", idempotencyKey)
        .send({
          reportType: "SALES",
          format: "XLSX",
          filters
        })
        .expect(202);

      const stored = await database.exportJob.findUniqueOrThrow({
        where: { id: created.body.id }
      });
      expect(
        (stored.resultSnapshot as { totals: unknown }).totals
      ).toEqual(report.body.totals);
      expect(stored.filters).toEqual(filters);
      expect(
        await database.auditLog.findFirst({
          where: {
            action: "EXPORT_REQUESTED",
            resourceType: "EXPORT_JOB",
            resourceId: stored.id
          }
        })
      ).not.toBeNull();

      await request(application.getHttpServer())
        .get(`/api/v1/exports/${stored.id}`)
        .set("cookie", otherSalesCookie)
        .expect(403);
      await request(application.getHttpServer())
        .get(`/api/v1/exports/${stored.id}`)
        .set("cookie", managerCookie)
        .expect(200);

      await request(application.getHttpServer())
        .post("/api/v1/exports")
        .set("cookie", salesCookie)
        .set("idempotency-key", idempotencyKey)
        .send({
          reportType: "SALES",
          format: "PDF",
          filters
        })
        .expect(409);
    });

    it("denies sales exports to the Warehouse role", async () => {
      await request(application.getHttpServer())
        .post("/api/v1/exports")
        .set("cookie", warehouseCookie)
        .set("idempotency-key", randomUUID())
        .send({
          reportType: "SALES",
          format: "PDF",
          filters: {
            dateFrom: "2099-01-01",
            dateTo: "2099-01-31",
            groupBy: "month"
          }
        })
        .expect(403);
    });
  }
);
