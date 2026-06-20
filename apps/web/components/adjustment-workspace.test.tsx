import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  InventoryAdjustmentResponse,
  PaginatedLotsResponse,
  ProductResponse
} from "@warehouse/contracts";

import { AdjustmentWorkspace } from "./adjustment-workspace";

const product: ProductResponse = {
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
};

const lots: PaginatedLotsResponse = {
  items: [
    {
      id: "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8",
      lotNumber: "LOT001",
      product: { id: product.id, code: product.code, name: product.name },
      warehouse: {
        id: "880f2aa8-d669-482f-93bc-cf986cad81ac",
        code: "MAIN",
        name: "คลังหลัก"
      },
      receivedAt: "2026-06-15T00:00:00.000Z",
      expiryDate: null,
      unitCost: "20.00",
      receivedQuantity: 100,
      received: 100,
      sold: 0,
      adjusted: 0,
      availableQuantity: 100,
      isActive: true,
      createdAt: "2026-06-15T00:00:00.000Z"
    }
  ],
  page: 1,
  pageSize: 100,
  total: 1
};

const receipt: InventoryAdjustmentResponse = {
  id: "8f8f233f-79d6-4499-b61d-abef2535f6d8",
  referenceNumber: "ADJ-001",
  direction: "DECREASE",
  quantity: 25,
  quantityDelta: -25,
  reason: "สินค้าชำรุด",
  product: { id: product.id, code: product.code, name: product.name },
  lot: { id: lots.items[0]!.id, lotNumber: "LOT001" },
  warehouse: lots.items[0]!.warehouse,
  beforeQuantity: 100,
  afterQuantity: 75,
  createdBy: {
    id: "cf4dbeb7-bbf5-4190-adf2-2f0ebd037e88",
    name: "Admin"
  },
  createdAt: "2026-06-15T01:00:00.000Z"
};

describe("AdjustmentWorkspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires an explicit lot and confirms before creating an adjustment", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(lots), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(receipt), {
          status: 201,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdjustmentWorkspace products={[product]} />);

    await waitFor(() =>
      expect(screen.getByRole("option", { name: /LOT001/ })).toBeInTheDocument()
    );
    expect(screen.getByLabelText("LOT")).toHaveValue("");

    await user.type(screen.getByLabelText("เลขที่อ้างอิง"), "adj-001");
    await user.selectOptions(screen.getByLabelText("LOT"), lots.items[0]!.id);
    await user.click(screen.getByRole("radio", { name: "ลดสต๊อก" }));
    await user.type(screen.getByLabelText("จำนวน"), "25");
    await user.type(screen.getByLabelText("เหตุผล"), "สินค้าชำรุด");
    await user.click(screen.getByRole("button", { name: "ตรวจสอบรายการ" }));

    expect(
      screen.getByRole("heading", { name: "ตรวจสอบก่อนปรับสต๊อก" })
    ).toBeInTheDocument();
    expect(screen.getByText("100 ชิ้น")).toBeInTheDocument();
    expect(screen.getByText("75 ชิ้น")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ยืนยันปรับสต๊อก" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "ADJ-001" })
      ).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/adjustments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          referenceNumber: "ADJ-001",
          lotId: lots.items[0]!.id,
          direction: "DECREASE",
          quantity: 25,
          reason: "สินค้าชำรุด"
        })
      })
    );
  });
});
