import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseClient } from "@warehouse/database";

import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "customers integration",
  () => {
    let application: INestApplication;
    let database: DatabaseClient;
    let adminCookie: string;
    let managerCookie: string;
    let salesCookie: string;
    let warehouseCookie: string;

    async function login(email: string): Promise<string> {
      const response = await request(application.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: "ChangeMe123!" })
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

      const [admin, managerRole, salesRole, warehouseRole] = await Promise.all([
        database.user.findUniqueOrThrow({
          where: { email: "admin@uok.local" }
        }),
        database.role.findUniqueOrThrow({ where: { name: "MANAGER" } }),
        database.role.findUniqueOrThrow({ where: { name: "SALES" } }),
        database.role.findUniqueOrThrow({ where: { name: "WAREHOUSE" } })
      ]);

      await Promise.all([
        database.user.create({
          data: {
            email: "manager.customer@uok.local",
            name: "Customer Manager",
            passwordHash: admin.passwordHash,
            roleId: managerRole.id
          }
        }),
        database.user.create({
          data: {
            email: "sales.customer@uok.local",
            name: "Customer Sales",
            passwordHash: admin.passwordHash,
            roleId: salesRole.id
          }
        }),
        database.user.create({
          data: {
            email: "warehouse.customer@uok.local",
            name: "Customer Warehouse",
            passwordHash: admin.passwordHash,
            roleId: warehouseRole.id
          }
        })
      ]);

      adminCookie = await login("admin@uok.local");
      managerCookie = await login("manager.customer@uok.local");
      salesCookie = await login("sales.customer@uok.local");
      warehouseCookie = await login("warehouse.customer@uok.local");
    });

    afterAll(async () => {
      await application.close();
    });

    it("manages customers, searches normalized phones and enforces RBAC", async () => {
      const payload = {
        code: "customer-integration",
        firstName: "สมชาย",
        lastName: "ใจดี",
        age: 35,
        gender: "MALE",
        address: "กรุงเทพฯ",
        phone: "081-234-5678",
        joinedAt: "2026-06-15T00:00:00.000Z"
      };

      const created = await request(application.getHttpServer())
        .post("/api/v1/customers")
        .set("cookie", salesCookie)
        .send(payload)
        .expect(201);
      expect(created.body).toMatchObject({
        code: "CUSTOMER-INTEGRATION",
        phone: "081-234-5678",
        isActive: true
      });

      await request(application.getHttpServer())
        .post("/api/v1/customers")
        .set("cookie", adminCookie)
        .send(payload)
        .expect(409);

      const searched = await request(application.getHttpServer())
        .get("/api/v1/customers?search=0812345678&status=active")
        .set("cookie", managerCookie)
        .expect(200);
      expect(searched.body).toMatchObject({
        page: 1,
        pageSize: 25,
        total: 1,
        items: [
          {
            id: created.body.id,
            phone: "081-234-5678"
          }
        ]
      });

      await request(application.getHttpServer())
        .patch(`/api/v1/customers/${created.body.id as string}`)
        .set("cookie", managerCookie)
        .send({ firstName: "ผู้จัดการแก้ไม่ได้" })
        .expect(403);

      await request(application.getHttpServer())
        .get("/api/v1/customers")
        .set("cookie", warehouseCookie)
        .expect(403);

      const history = await request(application.getHttpServer())
        .get(`/api/v1/customers/${created.body.id as string}/purchase-history`)
        .set("cookie", managerCookie)
        .expect(200);
      expect(history.body).toMatchObject({
        customer: { id: created.body.id },
        summary: {
          orderCount: 0,
          totalSales: "0.00",
          totalCost: "0.00",
          grossProfit: "0.00"
        },
        total: 0,
        items: []
      });

      const archived = await request(application.getHttpServer())
        .patch(`/api/v1/customers/${created.body.id as string}/archive`)
        .set("cookie", adminCookie)
        .expect(200);
      expect(archived.body).toMatchObject({
        id: created.body.id,
        isActive: false
      });

      await request(application.getHttpServer())
        .get(`/api/v1/customers/${created.body.id as string}`)
        .set("cookie", managerCookie)
        .expect(200);
    });
  }
);
