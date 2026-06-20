import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InventoryWorkspace } from "./inventory-workspace";

describe("InventoryWorkspace", () => {
  it("shows stock summary, lot totals and reconciliation state", () => {
    render(
      <InventoryWorkspace
        product={{
          id: "ac1d9514-b32e-4d03-865b-b46353705fe8",
          code: "P001",
          name: "สินค้า",
          category: {
            id: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
            code: "GENERAL",
            name: "ทั่วไป"
          },
          unit: {
            id: "f5420a40-bb3f-4e8b-9517-d47fa9819039",
            code: "PCS",
            name: "ชิ้น"
          },
          salePrice: "50.00",
          lowStockThreshold: 50,
          isActive: true,
          archivedAt: null,
          createdAt: "2026-06-15T00:00:00.000Z",
          updatedAt: "2026-06-15T00:00:00.000Z"
        }}
        stock={{
          product: {
            id: "ac1d9514-b32e-4d03-865b-b46353705fe8",
            code: "P001",
            name: "สินค้า"
          },
          warehouse: {
            id: "880f2aa8-d669-482f-93bc-cf986cad81ac",
            code: "MAIN",
            name: "คลังหลัก"
          },
          totalAvailable: 190,
          activeLotCount: 1
        }}
        lots={{
          page: 1,
          pageSize: 25,
          total: 1,
          items: [
            {
              id: "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8",
              lotNumber: "LOT001",
              product: {
                id: "ac1d9514-b32e-4d03-865b-b46353705fe8",
                code: "P001",
                name: "สินค้า"
              },
              warehouse: {
                id: "880f2aa8-d669-482f-93bc-cf986cad81ac",
                code: "MAIN",
                name: "คลังหลัก"
              },
              receivedAt: "2026-06-15T00:00:00.000Z",
              expiryDate: null,
              unitCost: "20.00",
              receivedQuantity: 300,
              received: 300,
              sold: 100,
              adjusted: -10,
              availableQuantity: 190,
              isActive: true,
              createdAt: "2026-06-15T00:00:00.000Z"
            }
          ]
        }}
        reconciliation={{
          productId: "ac1d9514-b32e-4d03-865b-b46353705fe8",
          warehouseId: "880f2aa8-d669-482f-93bc-cf986cad81ac",
          isBalanced: true,
          items: [
            {
              lotId: "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8",
              lotNumber: "LOT001",
              availableQuantity: 190,
              movementTotal: 190,
              difference: 0,
              isBalanced: true
            }
          ]
        }}
      />
    );

    expect(screen.getAllByText("190")).toHaveLength(2);
    expect(screen.getByText("LOT001")).toBeInTheDocument();
    expect(screen.getByText("Ledger ตรงกับยอดคงเหลือ")).toBeInTheDocument();
  });
});
