import { describe, expect, it } from "vitest";

import {
  cancelSaleRequestSchema,
  createSaleRequestSchema,
  paginatedSaleCatalogResponseSchema,
  saleCatalogQuerySchema,
  saleListQuerySchema,
  saleResponseSchema
} from "./sale.js";

const customerId = "ac1d9514-b32e-4d03-865b-b46353705fe8";
const productId = "880f2aa8-d669-482f-93bc-cf986cad81ac";
const warehouseId = "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8";

describe("sale contracts", () => {
  it("requires a meaningful whole-invoice cancellation reason", () => {
    expect(
      cancelSaleRequestSchema.parse({ reason: "ลูกค้าขอยกเลิกทั้งบิล" })
    ).toEqual({ reason: "ลูกค้าขอยกเลิกทั้งบิล" });
    expect(() => cancelSaleRequestSchema.parse({ reason: " " })).toThrow();
  });

  it("validates sale items and rejects duplicate products", () => {
    const input = {
      customerId,
      items: [{ productId, quantity: 500, unitPrice: "30.00" }]
    };
    expect(createSaleRequestSchema.parse(input)).toEqual(input);
    expect(() =>
      createSaleRequestSchema.parse({
        ...input,
        items: [...input.items, ...input.items]
      })
    ).toThrow();
  });

  it("normalizes deterministic sale filters", () => {
    expect(
      saleListQuerySchema.parse({
        page: "2",
        pageSize: "10",
        customerId,
        status: "all"
      })
    ).toEqual({
      page: 2,
      pageSize: 10,
      customerId,
      status: "all"
    });
  });

  it("validates the sale catalog without exposing lot cost", () => {
    expect(saleCatalogQuerySchema.parse({ search: "P001" })).toEqual({
      page: 1,
      pageSize: 25,
      search: "P001"
    });
    expect(
      paginatedSaleCatalogResponseSchema.parse({
        items: [
          {
            product: { id: productId, code: "P001", name: "Product" },
            unit: { code: "PCS", name: "Piece" },
            salePrice: "30.00",
            totalAvailable: 900
          }
        ],
        page: 1,
        pageSize: 25,
        total: 1
      }).items[0]
    ).not.toHaveProperty("unitCost");
  });

  it("validates allocation cost and gross-profit snapshots", () => {
    const response = saleResponseSchema.parse({
      id: "9c4761db-f4ff-4f20-9f67-44e5f4c2d8ff",
      invoiceNumber: "INV-20260615-000001",
      status: "COMPLETED",
      soldAt: "2026-06-15T00:00:00.000Z",
      customer: {
        id: customerId,
        code: "C-001",
        firstName: "สมชาย",
        lastName: "ใจดี"
      },
      warehouse: {
        id: warehouseId,
        code: "MAIN",
        name: "คลังหลัก"
      },
      createdBy: {
        id: "9df95fd2-a863-492b-9a73-e8f1f37b59cd",
        name: "ฝ่ายขาย"
      },
      totalSales: "15000.00",
      totalCost: "10400.00",
      grossProfit: "4600.00",
      cancellationReason: null,
      cancelledAt: null,
      createdAt: "2026-06-15T00:00:00.000Z",
      items: [
        {
          id: "03218462-9d6c-47c4-b929-b69715ee2f98",
          product: {
            id: productId,
            code: "P001",
            name: "สินค้า"
          },
          quantity: 500,
          unitPrice: "30.00",
          salesSubtotal: "15000.00",
          costSubtotal: "10400.00",
          grossProfit: "4600.00",
          allocations: [
            {
              id: "86aac44f-50c2-457c-a726-5a6ce3f39ec1",
              lotId: "2afb243b-f247-439b-adc6-32bdde769dfa",
              lotNumber: "LOT001",
              quantity: 300,
              unitCost: "20.00",
              costSubtotal: "6000.00"
            }
          ]
        }
      ]
    });

    expect(response.grossProfit).toBe("4600.00");
  });
});
