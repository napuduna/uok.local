import { healthResponseSchema } from "@warehouse/contracts";
import { describe, expect, it } from "vitest";

import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns the public API health contract", () => {
    const response = new HealthController().getHealth();

    expect(healthResponseSchema.parse(response)).toMatchObject({
      service: "api",
      status: "ok",
      version: "0.1.0"
    });
  });
});
