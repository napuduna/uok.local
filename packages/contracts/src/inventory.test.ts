import { describe, expect, it } from "vitest";

import {
  lotListQuerySchema,
  lotResponseSchema,
  reconciliationResponseSchema,
  stockSummaryResponseSchema
} from "./inventory.js";

const productId = "ac1d9514-b32e-4d03-865b-b46353705fe8";
const warehouseId = "880f2aa8-d669-482f-93bc-cf986cad81ac";
const lotId = "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8";

describe("inventory contracts", () => {
  it("normalizes deterministic lot list pagination", () => {
    expect(
      lotListQuerySchema.parse({
        page: "2",
        pageSize: "50",
        warehouseId,
        status: "all"
      })
    ).toEqual({
      page: 2,
      pageSize: 50,
      warehouseId,
      status: "all"
    });
  });

  it("validates lot quantities and decimal cost", () => {
    const result = lotResponseSchema.parse({
      id: lotId,
      lotNumber: "LOT001",
      product: { id: productId, code: "P001", name: "สินค้า" },
      warehouse: { id: warehouseId, code: "MAIN", name: "คลังหลัก" },
      receivedAt: "2026-06-15T00:00:00.000Z",
      expiryDate: "2027-06-15T00:00:00.000Z",
      unitCost: "20.00",
      receivedQuantity: 300,
      received: 300,
      sold: 100,
      adjusted: -10,
      availableQuantity: 190,
      isActive: true,
      createdAt: "2026-06-15T00:00:00.000Z"
    });

    expect(result.availableQuantity).toBe(190);
    expect(() =>
      lotResponseSchema.parse({ ...result, availableQuantity: -1 })
    ).toThrow();
    expect(() =>
      lotResponseSchema.parse({ ...result, unitCost: 20 })
    ).toThrow();
  });

  it("validates stock summary and reconciliation totals", () => {
    expect(
      stockSummaryResponseSchema.parse({
        product: { id: productId, code: "P001", name: "สินค้า" },
        warehouse: { id: warehouseId, code: "MAIN", name: "คลังหลัก" },
        totalAvailable: 190,
        activeLotCount: 1
      })
    ).toEqual(expect.objectContaining({ totalAvailable: 190 }));

    expect(
      reconciliationResponseSchema.parse({
        productId,
        warehouseId,
        isBalanced: true,
        items: [
          {
            lotId,
            lotNumber: "LOT001",
            availableQuantity: 190,
            movementTotal: 190,
            difference: 0,
            isBalanced: true
          }
        ]
      })
    ).toEqual(expect.objectContaining({ isBalanced: true }));
  });
});
