import { describe, expect, it } from "vitest";

import {
  createStockInRequestSchema,
  stockInListQuerySchema,
  stockInResponseSchema
} from "./stock-in.js";

const productId = "ac1d9514-b32e-4d03-865b-b46353705fe8";
const warehouseId = "880f2aa8-d669-482f-93bc-cf986cad81ac";

describe("stock-in contracts", () => {
  it("normalizes a valid multi-item stock-in request", () => {
    const result = createStockInRequestSchema.parse({
      referenceNumber: " si-001 ",
      warehouseId,
      receivedAt: "2026-06-15T00:00:00.000Z",
      items: [
        {
          productId,
          lotNumber: " lot001 ",
          expiryDate: "2027-06-15T00:00:00.000Z",
          quantity: 300,
          unitCost: "20.00"
        }
      ]
    });

    expect(result.referenceNumber).toBe("SI-001");
    expect(result.items[0]?.lotNumber).toBe("LOT001");
  });

  it("rejects duplicate lots, invalid expiry and non-positive values", () => {
    const baseItem = {
      productId,
      lotNumber: "LOT001",
      expiryDate: "2026-06-14T00:00:00.000Z",
      quantity: 0,
      unitCost: "0.00"
    };

    expect(() =>
      createStockInRequestSchema.parse({
        referenceNumber: "SI-001",
        receivedAt: "2026-06-15T00:00:00.000Z",
        items: [baseItem, baseItem]
      })
    ).toThrow();
  });

  it("validates stock-in response and list pagination", () => {
    expect(stockInListQuerySchema.parse({ page: "1", pageSize: "50" })).toEqual(
      { page: 1, pageSize: 50 }
    );

    expect(
      stockInResponseSchema.parse({
        id: "50d3c1a7-ae0d-4e82-8257-62297a32d48f",
        referenceNumber: "SI-001",
        warehouse: { id: warehouseId, code: "MAIN", name: "คลังหลัก" },
        receivedAt: "2026-06-15T00:00:00.000Z",
        createdBy: {
          id: "cf4dbeb7-bbf5-4190-adf2-2f0ebd037e88",
          name: "Admin"
        },
        createdAt: "2026-06-15T01:00:00.000Z",
        items: [
          {
            id: "d646b2b5-c269-40f7-8af7-40d48ea08459",
            product: { id: productId, code: "P001", name: "สินค้า" },
            lotId: "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8",
            lotNumber: "LOT001",
            expiryDate: null,
            quantity: 300,
            availableQuantity: 300,
            unitCost: "20.00"
          }
        ]
      })
    ).toEqual(expect.objectContaining({ referenceNumber: "SI-001" }));
  });
});
