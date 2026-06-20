import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CustomersWorkspace } from "./customers-workspace";

const customers = {
  items: [
    {
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
    }
  ],
  page: 1,
  pageSize: 25,
  total: 1
};

describe("CustomersWorkspace", () => {
  it("renders customer data and opens the management drawer", () => {
    render(
      <CustomersWorkspace initialCustomers={customers} canManage={true} />
    );

    expect(screen.getByText("สมชาย ใจดี")).toBeInTheDocument();
    expect(screen.getByText("081-234-5678")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "เพิ่มลูกค้า" }));
    expect(
      screen.getByRole("dialog", { name: "เพิ่มลูกค้า" })
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "รหัสลูกค้า" })).toHaveValue("");
  });

  it("keeps manager view read-only", () => {
    render(
      <CustomersWorkspace initialCustomers={customers} canManage={false} />
    );

    expect(screen.queryByRole("button", { name: "เพิ่มลูกค้า" })).toBeNull();
    expect(screen.queryByRole("button", { name: "แก้ไข C-001" })).toBeNull();
  });
});
