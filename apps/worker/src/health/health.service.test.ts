import { healthResponseSchema } from "@warehouse/contracts";
import { describe, expect, it } from "vitest";

import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("returns the public worker health contract", () => {
    const response = new HealthService().getHealth();

    expect(healthResponseSchema.parse(response)).toMatchObject({
      service: "worker",
      status: "ok",
      version: "0.1.0"
    });
  });
});
