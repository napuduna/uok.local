import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../database/database.service";
import { InventoryService } from "./inventory.service";

const product = {
  id: "ac1d9514-b32e-4d03-865b-b46353705fe8",
  code: "P001",
  name: "สินค้า"
};
const warehouse = {
  id: "880f2aa8-d669-482f-93bc-cf986cad81ac",
  code: "MAIN",
  name: "คลังหลัก"
};
const lot = {
  id: "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8",
  lotNumber: "LOT001",
  product,
  warehouse,
  receivedAt: new Date("2026-06-15T00:00:00.000Z"),
  expiryDate: new Date("2027-06-15T00:00:00.000Z"),
  unitCost: { toFixed: () => "20.00" },
  receivedQuantity: 300,
  availableQuantity: 190,
  isActive: true,
  createdAt: new Date("2026-06-15T00:00:00.000Z"),
  movements: [
    { type: "STOCK_IN", quantityDelta: 300 },
    { type: "SALE", quantityDelta: -100 },
    { type: "ADJUSTMENT_OUT", quantityDelta: -10 }
  ]
};

describe("InventoryService", () => {
  it("lists lots with movement-derived received, sold and adjusted totals", async () => {
    const findMany = vi.fn().mockResolvedValue([lot]);
    const count = vi.fn().mockResolvedValue(1);
    const database = {
      client: { lot: { findMany, count } }
    } as unknown as DatabaseService;
    const service = new InventoryService(database);

    const result = await service.listLots(product.id, {
      page: 1,
      pageSize: 25,
      status: "active"
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }]
      })
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        received: 300,
        sold: 100,
        adjusted: -10,
        availableQuantity: 190
      })
    );
  });

  it("returns product stock summary for the default warehouse", async () => {
    const database = {
      client: {
        product: { findUnique: vi.fn().mockResolvedValue(product) },
        warehouse: { findFirst: vi.fn().mockResolvedValue(warehouse) },
        lot: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { availableQuantity: 190 },
            _count: { id: 1 }
          })
        }
      }
    } as unknown as DatabaseService;
    const service = new InventoryService(database);

    await expect(service.stockSummary(product.id)).resolves.toEqual({
      product,
      warehouse,
      totalAvailable: 190,
      activeLotCount: 1
    });
  });

  it("reports reconciliation differences without mutating inventory", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        ...lot,
        availableQuantity: 195,
        movements: [
          { type: "STOCK_IN", quantityDelta: 300 },
          { type: "SALE", quantityDelta: -100 },
          { type: "ADJUSTMENT_OUT", quantityDelta: -10 }
        ]
      }
    ]);
    const update = vi.fn();
    const database = {
      client: { lot: { findMany, update } }
    } as unknown as DatabaseService;
    const service = new InventoryService(database);

    const result = await service.reconcile(product.id, warehouse.id);

    expect(result).toEqual({
      productId: product.id,
      warehouseId: warehouse.id,
      isBalanced: false,
      items: [
        {
          lotId: lot.id,
          lotNumber: "LOT001",
          availableQuantity: 195,
          movementTotal: 190,
          difference: 5,
          isBalanced: false
        }
      ]
    });
    expect(update).not.toHaveBeenCalled();
  });
});
