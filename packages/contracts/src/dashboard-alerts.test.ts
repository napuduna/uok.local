import { describe, expect, it } from "vitest";

import {
  dashboardAlertsResponseSchema,
  expiryAlertListQuerySchema,
  lowStockAlertListQuerySchema
} from "./dashboard-alerts.js";

const productId = "ac1d9514-b32e-4d03-865b-b46353705fe8";
const warehouseId = "880f2aa8-d669-482f-93bc-cf986cad81ac";
const lotId = "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8";

describe("dashboard alert contracts", () => {
  it("normalizes deterministic alert filters and pagination", () => {
    expect(
      lowStockAlertListQuerySchema.parse({ page: "2", pageSize: "10" })
    ).toEqual({ page: 2, pageSize: 10 });
    expect(
      expiryAlertListQuerySchema.parse({
        page: "3",
        pageSize: "20",
        status: "expiring",
        daysAhead: "45"
      })
    ).toEqual({
      page: 3,
      pageSize: 20,
      status: "expiring",
      daysAhead: 45
    });
  });

  it("validates dashboard alert counts and preview items", () => {
    const result = dashboardAlertsResponseSchema.parse({
      warehouse: {
        id: warehouseId,
        code: "MAIN",
        name: "Main warehouse"
      },
      lowStockCount: 1,
      expiredLotCount: 1,
      expiringSoonLotCount: 1,
      lowStockItems: [
        {
          product: {
            id: productId,
            code: "P001",
            name: "Low stock product"
          },
          totalAvailable: 30,
          lowStockThreshold: 50,
          shortage: 20
        }
      ],
      expiryItems: [
        {
          lot: {
            id: lotId,
            lotNumber: "LOT001"
          },
          product: {
            id: productId,
            code: "P001",
            name: "Low stock product"
          },
          expiryDate: "2026-06-25T00:00:00.000Z",
          availableQuantity: 30,
          status: "EXPIRING_SOON",
          daysUntilExpiry: 10
        }
      ]
    });

    expect(result.lowStockItems[0]?.shortage).toBe(20);
    expect(result.expiryItems[0]?.status).toBe("EXPIRING_SOON");
  });
});
