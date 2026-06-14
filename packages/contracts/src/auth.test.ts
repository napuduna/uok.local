import { describe, expect, it } from "vitest";

import { loginRequestSchema, sessionResponseSchema } from "./auth";

describe("auth contracts", () => {
  it("normalizes a valid login email", () => {
    expect(
      loginRequestSchema.parse({
        email: " Admin@UOK.Local ",
        password: "CorrectHorse123!"
      })
    ).toEqual({
      email: "admin@uok.local",
      password: "CorrectHorse123!"
    });
  });

  it("rejects malformed credentials", () => {
    expect(
      loginRequestSchema.safeParse({ email: "not-an-email", password: "" })
        .success
    ).toBe(false);
  });

  it("requires the public session shape without password data", () => {
    expect(
      sessionResponseSchema.safeParse({
        user: {
          id: "346a5fe3-4b31-4c89-ac39-37a2d13cf14d",
          email: "admin@uok.local",
          name: "ผู้ดูแลระบบ",
          role: "ADMIN"
        },
        expiresAt: "2026-06-14T10:00:00.000Z"
      }).success
    ).toBe(true);
  });
});
