import { describe, expect, it } from "vitest";

import * as contracts from "./index.js";

describe("product contracts", () => {
  it("validates a product create request with THB decimal and default threshold", () => {
    const result = contracts.createProductRequestSchema.parse({
      code: "P001",
      name: "สบู่สมุนไพร",
      categoryId: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
      unitId: "f5420a40-bb3f-4e8b-9517-d47fa9819039",
      salePrice: "80.00"
    });

    expect(result).toEqual({
      code: "P001",
      name: "สบู่สมุนไพร",
      categoryId: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
      unitId: "f5420a40-bb3f-4e8b-9517-d47fa9819039",
      salePrice: "80.00",
      lowStockThreshold: 50
    });
  });

  it("rejects floating-point money, negative thresholds and blank codes", () => {
    expect(() =>
      contracts.createProductRequestSchema.parse({
        code: " ",
        name: "สินค้า",
        categoryId: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
        unitId: "f5420a40-bb3f-4e8b-9517-d47fa9819039",
        salePrice: 80.5,
        lowStockThreshold: -1
      })
    ).toThrow();
  });

  it("normalizes list filters and enforces deterministic pagination limits", () => {
    expect(
      contracts.productListQuerySchema.parse({
        page: "2",
        pageSize: "25",
        search: "  P001  ",
        status: "active"
      })
    ).toEqual({
      page: 2,
      pageSize: 25,
      search: "P001",
      status: "active"
    });

    expect(() =>
      contracts.productListQuerySchema.parse({ pageSize: "101" })
    ).toThrow();
  });

  it("represents archived products without deleting their identity", () => {
    const response = contracts.productResponseSchema.parse({
      id: "ac1d9514-b32e-4d03-865b-b46353705fe8",
      code: "P001",
      name: "สบู่สมุนไพร",
      category: {
        id: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
        code: "HERBAL",
        name: "สมุนไพร"
      },
      unit: {
        id: "f5420a40-bb3f-4e8b-9517-d47fa9819039",
        code: "PCS",
        name: "ชิ้น"
      },
      salePrice: "80.00",
      lowStockThreshold: 50,
      isActive: false,
      archivedAt: "2026-06-15T04:00:00.000Z",
      createdAt: "2026-06-15T03:00:00.000Z",
      updatedAt: "2026-06-15T04:00:00.000Z"
    });

    expect(response.isActive).toBe(false);
    expect(response.archivedAt).toBe("2026-06-15T04:00:00.000Z");
  });

  it("validates category and unit list responses", () => {
    expect(
      contracts.masterDataListResponseSchema.parse([
        {
          id: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
          code: "HERBAL",
          name: "สมุนไพร",
          isActive: true
        }
      ])
    ).toHaveLength(1);
  });
});
