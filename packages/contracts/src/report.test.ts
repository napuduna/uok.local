import { describe, expect, it } from "vitest";

import {
  grossProfitReportResponseSchema,
  inventoryExpiryReportResponseSchema,
  reportDateRangeQuerySchema,
  salesReportResponseSchema
} from "./report";

describe("report contracts", () => {
  it("parses a Bangkok business date range with deterministic pagination defaults", () => {
    expect(
      reportDateRangeQuerySchema.parse({
        dateFrom: "2026-02-01",
        dateTo: "2026-02-28",
        groupBy: "month"
      })
    ).toEqual({
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      groupBy: "month",
      page: 1,
      pageSize: 25
    });
  });

  it("rejects an inverted report date range", () => {
    expect(() =>
      reportDateRangeQuerySchema.parse({
        dateFrom: "2026-03-01",
        dateTo: "2026-02-28"
      })
    ).toThrow();
  });

  it("validates sales and gross-profit totals as decimal strings", () => {
    const common = {
      page: 1,
      pageSize: 25,
      total: 1
    };

    expect(
      salesReportResponseSchema.parse({
        ...common,
        items: [
          {
            period: "2026-02-01",
            invoiceCount: 2,
            quantitySold: 8,
            totalSales: "300.00"
          }
        ],
        totals: {
          invoiceCount: 2,
          quantitySold: 8,
          totalSales: "300.00"
        }
      }).totals.totalSales
    ).toBe("300.00");

    expect(
      grossProfitReportResponseSchema.parse({
        ...common,
        items: [
          {
            period: "2026-02-01",
            totalSales: "300.00",
            totalCost: "160.00",
            grossProfit: "140.00"
          }
        ],
        totals: {
          totalSales: "300.00",
          totalCost: "160.00",
          grossProfit: "140.00"
        }
      }).totals.grossProfit
    ).toBe("140.00");
  });

  it("validates expiry report rows with stable stock valuation", () => {
    const result = inventoryExpiryReportResponseSchema.parse({
      page: 1,
      pageSize: 25,
      total: 1,
      items: [
        {
          lot: { id: "00000000-0000-4000-8000-000000000001", lotNumber: "LOT-1" },
          product: {
            id: "00000000-0000-4000-8000-000000000002",
            code: "P-001",
            name: "Product"
          },
          expiryDate: "2026-02-10T00:00:00.000Z",
          availableQuantity: 5,
          unitCost: "20.00",
          inventoryValue: "100.00",
          status: "EXPIRING_SOON",
          daysUntilExpiry: 9
        }
      ],
      totals: {
        quantity: 5,
        inventoryValue: "100.00"
      }
    });

    expect(result.items[0]?.inventoryValue).toBe("100.00");
  });
});
