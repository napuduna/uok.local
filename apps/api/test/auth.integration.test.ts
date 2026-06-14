import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "authentication integration",
  () => {
    let application: INestApplication;

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();

      application = module.createNestApplication();
      application.setGlobalPrefix("api/v1");
      await application.init();
    });

    afterAll(async () => {
      await application.close();
    });

    it("creates, reads and deletes a Redis-backed session", async () => {
      const login = await request(application.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email: "admin@uok.local",
          password: process.env.DEV_ADMIN_PASSWORD ?? "ChangeMe123!"
        })
        .expect(200);

      const cookies = login.headers["set-cookie"];
      const sessionCookie = Array.isArray(cookies) ? cookies[0] : cookies;
      if (!sessionCookie) {
        throw new Error("Login response did not set a session cookie");
      }
      expect(sessionCookie).toContain("warehouse_session=");
      expect(sessionCookie).toContain("HttpOnly");

      await request(application.getHttpServer())
        .get("/api/v1/auth/me")
        .set("cookie", sessionCookie)
        .expect(200)
        .expect(({ body }) => {
          expect(body.user).toMatchObject({
            email: "admin@uok.local",
            role: "ADMIN"
          });
        });

      await request(application.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("cookie", sessionCookie)
        .expect(204);

      await request(application.getHttpServer())
        .get("/api/v1/auth/me")
        .set("cookie", sessionCookie)
        .expect(401);
    });
  }
);
