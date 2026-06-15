import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductResponse } from "@warehouse/contracts";

import { StockInWorkspace } from "./stock-in-workspace";

const products: ProductResponse[] = [
  {
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
  }
];

describe("StockInWorkspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a multi-item receipt and shows review before confirmation", async () => {
    const user = userEvent.setup();
    render(<StockInWorkspace products={products} />);

    await user.type(screen.getByLabelText("เลขที่อ้างอิง"), "SI-001");
    await user.type(screen.getByLabelText("LOT รายการ 1"), "LOT001");
    await user.type(screen.getByLabelText("จำนวน รายการ 1"), "300");
    await user.type(screen.getByLabelText("ต้นทุนต่อหน่วย รายการ 1"), "20");
    await user.click(screen.getByRole("button", { name: "เพิ่มรายการ" }));

    expect(screen.getByLabelText("LOT รายการ 2")).toBeInTheDocument();
    await user.type(screen.getByLabelText("LOT รายการ 2"), "LOT002");
    await user.type(screen.getByLabelText("จำนวน รายการ 2"), "100");
    await user.type(screen.getByLabelText("ต้นทุนต่อหน่วย รายการ 2"), "22");
    await user.click(screen.getByRole("button", { name: "ตรวจสอบรายการ" }));

    expect(
      screen.getByRole("heading", { name: "ตรวจสอบก่อนรับสินค้า" })
    ).toBeInTheDocument();
    expect(screen.getByText("LOT001")).toBeInTheDocument();
  });

  it("opens review when randomUUID is unavailable on an insecure origin", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues(values: Uint32Array) {
        values.fill(42);
        return values;
      }
    });
    const user = userEvent.setup();
    render(<StockInWorkspace products={products} />);

    await user.type(screen.getByLabelText("เลขที่อ้างอิง"), "SI-HTTP");
    await user.type(screen.getByLabelText("LOT รายการ 1"), "LOT-HTTP");
    await user.type(screen.getByLabelText("จำนวน รายการ 1"), "10");
    await user.type(
      screen.getByLabelText("ต้นทุนต่อหน่วย รายการ 1"),
      "15.00"
    );
    await user.click(screen.getByRole("button", { name: "ตรวจสอบรายการ" }));

    expect(
      screen.getByRole("heading", { name: "ตรวจสอบก่อนรับสินค้า" })
    ).toBeInTheDocument();
  });
});
