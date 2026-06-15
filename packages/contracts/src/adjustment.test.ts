import { describe, expect, it } from "vitest";

import { createInventoryAdjustmentRequestSchema } from "./adjustment.js";

describe("inventory adjustment contracts", () => {
  it("normalizes a valid lot adjustment request", () => {
    expect(
      createInventoryAdjustmentRequestSchema.parse({
        referenceNumber: " adj-001 ",
        lotId: "4e9378d8-3214-45df-a1e2-5fc9225f4a81",
        direction: "DECREASE",
        quantity: 25,
        reason: "  damaged during transport  "
      })
    ).toEqual({
      referenceNumber: "ADJ-001",
      lotId: "4e9378d8-3214-45df-a1e2-5fc9225f4a81",
      direction: "DECREASE",
      quantity: 25,
      reason: "damaged during transport"
    });
  });

  it("requires a positive integer quantity and a meaningful reason", () => {
    const result = createInventoryAdjustmentRequestSchema.safeParse({
      referenceNumber: "ADJ-002",
      lotId: "4e9378d8-3214-45df-a1e2-5fc9225f4a81",
      direction: "INCREASE",
      quantity: 0,
      reason: " "
    });

    expect(result.success).toBe(false);
  });
});
