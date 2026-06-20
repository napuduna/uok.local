import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RoleValue } from "@warehouse/contracts";
import type { DatabaseClient } from "@warehouse/database";

import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "MVP RBAC matrix integration",
  () => {
    let application: INestApplication;
    let database: DatabaseClient;
    const cookies = new Map<RoleValue, string>();
    const emails: Record<Exclude<RoleValue, "ADMIN">, string> = {
      MANAGER: "manager.rbac@uok.local",
      SALES: "sales.rbac@uok.local",
      WAREHOUSE: "warehouse.rbac@uok.local"
    };

    async function login(email: string): Promise<string> {
      const response = await request(application.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: "ChangeMe123!" })
        .expect(200);
      const cookie = response.get("set-cookie")?.[0];
      if (!cookie) throw new Error(`Login did not set a session for ${email}`);
      return cookie;
    }

    function agent(role: RoleValue) {
      const cookie = cookies.get(role);
      if (!cookie) throw new Error(`Missing session for ${role}`);
      const server = application.getHttpServer();
      return {
        get: (path: string) => request(server).get(path).set("cookie", cookie),
        post: (path: string) =>
          request(server).post(path).set("cookie", cookie)
      };
    }

    function expectAllowed(response: request.Response) {
      expect(response.status, JSON.stringify(response.body)).not.toBe(401);
      expect(response.status, JSON.stringify(response.body)).not.toBe(403);
    }

    function expectForbidden(response: request.Response) {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: "PERMISSION_DENIED" });
    }

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();
      application = module.createNestApplication();
      application.setGlobalPrefix("api/v1");
      await application.init();

      database = application.get(DatabaseService).client;
      const admin = await database.user.findUniqueOrThrow({
        where: { email: "admin@uok.local" }
      });
      const roles = await database.role.findMany();
      const roleIdByName = new Map(roles.map((role) => [role.name, role.id]));

      await Promise.all(
        (Object.entries(emails) as [Exclude<RoleValue, "ADMIN">, string][]).map(
          ([role, email]) =>
            database.user.upsert({
              where: { email },
              update: {
                isActive: true,
                passwordHash: admin.passwordHash,
                roleId: roleIdByName.get(role)!
              },
              create: {
                email,
                name: `${role} RBAC`,
                passwordHash: admin.passwordHash,
                roleId: roleIdByName.get(role)!
              }
            })
        )
      );

      cookies.set("ADMIN", await login("admin@uok.local"));
      cookies.set("MANAGER", await login(emails.MANAGER));
      cookies.set("SALES", await login(emails.SALES));
      cookies.set("WAREHOUSE", await login(emails.WAREHOUSE));
    });

    afterAll(async () => {
      await database.user.deleteMany({
        where: { email: { in: Object.values(emails) } }
      });
      await application.close();
    });

    it("enforces user administration rights", async () => {
      expectAllowed(await agent("ADMIN").get("/api/v1/users"));
      expectForbidden(await agent("MANAGER").get("/api/v1/users"));
      expectForbidden(await agent("SALES").get("/api/v1/users"));
      expectForbidden(await agent("WAREHOUSE").get("/api/v1/users"));
    });

    it("allows dashboard access while applying role-specific costing scope", async () => {
      const admin = await agent("ADMIN").get("/api/v1/dashboard/summary");
      const manager = await agent("MANAGER").get("/api/v1/dashboard/summary");
      const sales = await agent("SALES").get("/api/v1/dashboard/summary");
      const warehouse = await agent("WAREHOUSE").get("/api/v1/dashboard/summary");

      for (const response of [admin, manager, sales, warehouse]) {
        expectAllowed(response);
      }
      expect(admin.body.cards.inventoryValue).toEqual(expect.any(String));
      expect(manager.body.cards.inventoryValue).toEqual(expect.any(String));
      expect(sales.body.cards.inventoryValue).toBeNull();
      expect(warehouse.body.cards.monthSales).toBeNull();
      expect(warehouse.body.cards.monthGrossProfit).toBeNull();
    });

    it("enforces product read and manage permissions", async () => {
      for (const role of ["ADMIN", "MANAGER", "SALES", "WAREHOUSE"] as const) {
        expectAllowed(await agent(role).get("/api/v1/products"));
      }

      expectAllowed(await agent("ADMIN").post("/api/v1/products").send({}));
      expectForbidden(await agent("MANAGER").post("/api/v1/products").send({}));
      expectForbidden(await agent("SALES").post("/api/v1/products").send({}));
      expectAllowed(
        await agent("WAREHOUSE").post("/api/v1/products").send({})
      );
    });

    it("enforces stock read and mutation permissions", async () => {
      for (const role of ["ADMIN", "MANAGER", "WAREHOUSE"] as const) {
        expectAllowed(await agent(role).get("/api/v1/stock-ins"));
        expectAllowed(await agent(role).get("/api/v1/adjustments"));
      }
      expectForbidden(await agent("SALES").get("/api/v1/stock-ins"));
      expectForbidden(await agent("SALES").get("/api/v1/adjustments"));

      for (const path of ["/api/v1/stock-ins", "/api/v1/adjustments"]) {
        expectAllowed(
          await agent("ADMIN")
            .post(path)
            .set("idempotency-key", `rbac-admin-${path}`)
            .send({})
        );
        expectForbidden(
          await agent("MANAGER")
            .post(path)
            .set("idempotency-key", `rbac-manager-${path}`)
            .send({})
        );
        expectForbidden(
          await agent("SALES")
            .post(path)
            .set("idempotency-key", `rbac-sales-${path}`)
            .send({})
        );
        expectAllowed(
          await agent("WAREHOUSE")
            .post(path)
            .set("idempotency-key", `rbac-warehouse-${path}`)
            .send({})
        );
      }
    });

    it("enforces sales read, creation and cancellation permissions", async () => {
      for (const role of ["ADMIN", "MANAGER", "SALES"] as const) {
        expectAllowed(await agent(role).get("/api/v1/sales"));
      }
      expectForbidden(await agent("WAREHOUSE").get("/api/v1/sales"));

      for (const role of ["ADMIN", "SALES"] as const) {
        expectAllowed(
          await agent(role)
            .post("/api/v1/sales")
            .set("idempotency-key", `rbac-sale-create-${role}`)
            .send({})
        );
        expectAllowed(
          await agent(role)
            .post("/api/v1/sales/00000000-0000-4000-8000-000000000000/cancel")
            .set("idempotency-key", `rbac-sale-cancel-${role}`)
            .send({ reason: "RBAC matrix check" })
        );
      }

      for (const role of ["MANAGER", "WAREHOUSE"] as const) {
        expectForbidden(
          await agent(role)
            .post("/api/v1/sales")
            .set("idempotency-key", `rbac-sale-create-${role}`)
            .send({})
        );
        expectForbidden(
          await agent(role)
            .post("/api/v1/sales/00000000-0000-4000-8000-000000000000/cancel")
            .set("idempotency-key", `rbac-sale-cancel-${role}`)
            .send({ reason: "RBAC matrix check" })
        );
      }
    });

    it("enforces customer read and manage permissions", async () => {
      for (const role of ["ADMIN", "MANAGER", "SALES"] as const) {
        expectAllowed(await agent(role).get("/api/v1/customers"));
      }
      expectForbidden(await agent("WAREHOUSE").get("/api/v1/customers"));

      expectAllowed(await agent("ADMIN").post("/api/v1/customers").send({}));
      expectForbidden(
        await agent("MANAGER").post("/api/v1/customers").send({})
      );
      expectAllowed(await agent("SALES").post("/api/v1/customers").send({}));
      expectForbidden(
        await agent("WAREHOUSE").post("/api/v1/customers").send({})
      );
    });
  }
);
