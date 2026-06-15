import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseClient } from "@warehouse/database";

import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "products integration",
  () => {
    let application: INestApplication;
    let database: DatabaseClient;
    const productCode = "P-INTEGRATION";
    const salesEmail = "sales.product.integration@uok.local";
    const password = "ChangeMe123!";

    async function login(email: string): Promise<string> {
      const response = await request(application.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password })
        .expect(200);
      const sessionCookie = response.get("set-cookie")?.[0];
      if (!sessionCookie) throw new Error("Login did not set a session cookie");
      return sessionCookie;
    }

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();
      application = module.createNestApplication();
      application.setGlobalPrefix("api/v1");
      await application.init();

      database = application.get(DatabaseService).client;
      await database.product.deleteMany({ where: { code: productCode } });
      const salesRole = await database.role.findUniqueOrThrow({
        where: { name: "SALES" }
      });
      await database.user.upsert({
        where: { email: salesEmail },
        update: {
          isActive: true,
          passwordHash: await bcrypt.hash(password, 4),
          roleId: salesRole.id
        },
        create: {
          email: salesEmail,
          name: "ฝ่ายขายทดสอบสินค้า",
          passwordHash: await bcrypt.hash(password, 4),
          roleId: salesRole.id
        }
      });
    });

    afterAll(async () => {
      await database.product.deleteMany({ where: { code: productCode } });
      await database.user.deleteMany({ where: { email: salesEmail } });
      await application.close();
    });

    it("enforces unique code, RBAC, pagination and archive behavior", async () => {
      const [category, unit] = await Promise.all([
        database.category.findUniqueOrThrow({ where: { code: "GENERAL" } }),
        database.unit.findUniqueOrThrow({ where: { code: "PCS" } })
      ]);
      const adminCookie = await login("admin@uok.local");
      const salesCookie = await login(salesEmail);
      const payload = {
        code: productCode,
        name: "สินค้าทดสอบระบบ",
        categoryId: category.id,
        unitId: unit.id,
        salePrice: "125.50"
      };

      const created = await request(application.getHttpServer())
        .post("/api/v1/products")
        .set("cookie", adminCookie)
        .send(payload)
        .expect(201);

      expect(created.body).toMatchObject({
        code: productCode,
        salePrice: "125.50",
        lowStockThreshold: 50,
        isActive: true
      });

      await request(application.getHttpServer())
        .post("/api/v1/products")
        .set("cookie", adminCookie)
        .send(payload)
        .expect(409);

      const list = await request(application.getHttpServer())
        .get(`/api/v1/products?search=${productCode}&status=active`)
        .set("cookie", adminCookie)
        .expect(200);
      expect(list.body).toMatchObject({
        page: 1,
        pageSize: 25,
        total: 1
      });

      await request(application.getHttpServer())
        .post("/api/v1/products")
        .set("cookie", salesCookie)
        .send({ ...payload, code: `${productCode}-DENIED` })
        .expect(403);

      const archived = await request(application.getHttpServer())
        .patch(`/api/v1/products/${created.body.id as string}/archive`)
        .set("cookie", adminCookie)
        .expect(200);
      expect(archived.body).toMatchObject({
        id: created.body.id,
        isActive: false
      });
    });
  }
);
