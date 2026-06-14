import { describe, expect, it } from "vitest";

import { apiErrorResponseSchema } from "./api-error";

describe("apiErrorResponseSchema", () => {
  it("accepts the standard client-safe error envelope", () => {
    expect(
      apiErrorResponseSchema.safeParse({
        code: "VALIDATION_ERROR",
        message: "ข้อมูลไม่ถูกต้อง",
        details: { fieldErrors: { email: ["อีเมลไม่ถูกต้อง"] } },
        requestId: "a63fbd69-92ba-4017-9b9f-fb169a44620b"
      }).success
    ).toBe(true);
  });
});
