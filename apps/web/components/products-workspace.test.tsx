import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type {
  MasterDataResponse,
  PaginatedProductsResponse
} from "@warehouse/contracts";

import { ProductsWorkspace } from "./products-workspace";

const categories: MasterDataResponse[] = [
  {
    id: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
    code: "HERBAL",
    name: "สมุนไพร",
    isActive: true
  }
];

const units: MasterDataResponse[] = [
  {
    id: "f5420a40-bb3f-4e8b-9517-d47fa9819039",
    code: "PCS",
    name: "ชิ้น",
    isActive: true
  }
];

const products: PaginatedProductsResponse = {
  items: [
    {
      id: "ac1d9514-b32e-4d03-865b-b46353705fe8",
      code: "P001",
      name: "สบู่สมุนไพร",
      category: categories[0]!,
      unit: units[0]!,
      salePrice: "80.00",
      lowStockThreshold: 50,
      isActive: true,
      archivedAt: null,
      createdAt: "2026-06-15T03:00:00.000Z",
      updatedAt: "2026-06-15T03:00:00.000Z"
    }
  ],
  page: 1,
  pageSize: 25,
  total: 1
};

describe("ProductsWorkspace", () => {
  it("renders a searchable table with product master data", () => {
    render(
      <ProductsWorkspace
        initialProducts={products}
        categories={categories}
        units={units}
        canManage={false}
        canViewStock={false}
      />
    );

    expect(
      screen.getByRole("searchbox", { name: "ค้นหาสินค้า" })
    ).toBeInTheDocument();
    expect(screen.getByText("P001")).toBeInTheDocument();
    expect(screen.getByText("สบู่สมุนไพร")).toBeInTheDocument();
    expect(screen.getByText("฿80.00")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "เพิ่มสินค้า" })
    ).not.toBeInTheDocument();
  });

  it("opens a product drawer with threshold 50 for managing roles", async () => {
    const user = userEvent.setup();
    render(
      <ProductsWorkspace
        initialProducts={products}
        categories={categories}
        units={units}
        canManage
        canViewStock
      />
    );

    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));

    expect(
      screen.getByRole("dialog", { name: "เพิ่มสินค้า" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("จุดแจ้งเตือนสต๊อกต่ำ")).toHaveValue(50);
  });
});
