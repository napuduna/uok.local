import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { calculateSaleTotal, SalesWorkspace } from "./sales-workspace";

const customer = {
  id: "ac1d9514-b32e-4d03-865b-b46353705fe8",
  code: "C-001",
  firstName: "สมชาย",
  lastName: "ใจดี",
  age: 35,
  gender: "MALE" as const,
  address: "กรุงเทพฯ",
  phone: "081-234-5678",
  joinedAt: "2026-06-14T17:00:00.000Z",
  isActive: true,
  archivedAt: null,
  createdAt: "2026-06-15T00:00:00.000Z",
  updatedAt: "2026-06-15T00:00:00.000Z"
};

const catalogItem = {
  product: {
    id: "880f2aa8-d669-482f-93bc-cf986cad81ac",
    code: "P001",
    name: "สินค้าทดสอบ"
  },
  unit: { code: "PCS", name: "ชิ้น" },
  salePrice: "30.00",
  totalAvailable: 900
};

const sale = {
  id: "9c4761db-f4ff-4f20-9f67-44e5f4c2d8ff",
  invoiceNumber: "INV-20260615-000001",
  status: "COMPLETED" as const,
  soldAt: "2026-06-15T00:00:00.000Z",
  customer: {
    id: customer.id,
    code: customer.code,
    firstName: customer.firstName,
    lastName: customer.lastName
  },
  warehouse: {
    id: "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8",
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
      product: catalogItem.product,
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
};

describe("SalesWorkspace", () => {
  it("renders sale history and opens the sale form", () => {
    render(
      <SalesWorkspace
        initialSales={{ items: [sale], page: 1, pageSize: 25, total: 1 }}
        initialCustomers={[customer]}
        initialCatalog={{
          items: [catalogItem],
          page: 1,
          pageSize: 25,
          total: 1
        }}
        canCreate={true}
      />
    );

    expect(screen.getByRole("link", { name: sale.invoiceNumber })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "สร้างบิลขาย" }));
    expect(
      screen.getByRole("heading", { name: "สร้างบิลขาย" })
    ).toBeVisible();
    expect(screen.getByText("คงเหลือ 900 ชิ้น")).toBeVisible();
  });

  it("calculates totals with decimal cents", () => {
    expect(
      calculateSaleTotal([{ quantity: "2", unitPrice: "30.50" }])
    ).toBe("61.00");
  });
});
