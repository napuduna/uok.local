import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardShell } from "./dashboard-shell";

describe("DashboardShell", () => {
  it("renders the approved Thai operational navigation", () => {
    render(<DashboardShell />);

    expect(screen.getByText("ยู.โอเค คลังสินค้า")).toBeInTheDocument();
    expect(screen.getByText("ภาพรวม")).toBeInTheDocument();
    expect(screen.getByText("รับสินค้าเข้า")).toBeInTheDocument();
    expect(screen.getByText("การขาย")).toBeInTheDocument();
  });

  it("shows the compact foundation dashboard metrics", () => {
    render(<DashboardShell />);

    expect(screen.getByText("สินค้าทั้งหมด")).toBeInTheDocument();
    expect(screen.getByText("สินค้าคงเหลือ")).toBeInTheDocument();
    expect(screen.getByText("กำไรขั้นต้นเดือนนี้")).toBeInTheDocument();
  });

  it("shows live low-stock and expiry alert previews", () => {
    render(
      <DashboardShell
        dashboardAlerts={{
          warehouse: {
            id: "880f2aa8-d669-482f-93bc-cf986cad81ac",
            code: "MAIN",
            name: "คลังหลัก"
          },
          lowStockCount: 1,
          expiredLotCount: 1,
          expiringSoonLotCount: 1,
          lowStockItems: [
            {
              product: {
                id: "ac1d9514-b32e-4d03-865b-b46353705fe8",
                code: "P001",
                name: "สินค้าสต๊อกต่ำ"
              },
              totalAvailable: 12,
              lowStockThreshold: 50,
              shortage: 38
            }
          ],
          expiryItems: [
            {
              lot: {
                id: "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8",
                lotNumber: "LOT-EXP-001"
              },
              product: {
                id: "ac1d9514-b32e-4d03-865b-b46353705fe8",
                code: "P001",
                name: "สินค้าสต๊อกต่ำ"
              },
              expiryDate: "2026-06-14T00:00:00.000Z",
              availableQuantity: 5,
              status: "EXPIRED",
              daysUntilExpiry: -1
            }
          ]
        }}
      />
    );

    expect(screen.getAllByText("สินค้าสต๊อกต่ำ")).toHaveLength(2);
    expect(screen.getByText("LOT-EXP-001")).toBeInTheDocument();
    expect(
      screen.getByText("3", { selector: ".alert-count" })
    ).toBeInTheDocument();
  });
});
