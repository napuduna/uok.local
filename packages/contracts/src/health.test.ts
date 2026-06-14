import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "./health";

describe("healthResponseSchema", () => {
  it("accepts the public health response contract", () => {
    expect(
      healthResponseSchema.parse({
        service: "api",
        status: "ok",
        timestamp: "2026-06-13T12:00:00.000Z",
        version: "0.1.0"
      })
    ).toEqual({
      service: "api",
      status: "ok",
      timestamp: "2026-06-13T12:00:00.000Z",
      version: "0.1.0"
    });
  });

  it("rejects a non-ISO timestamp", () => {
    expect(() =>
      healthResponseSchema.parse({
        service: "api",
        status: "ok",
        timestamp: "13/06/2026",
        version: "0.1.0"
      })
    ).toThrow();
  });
});
