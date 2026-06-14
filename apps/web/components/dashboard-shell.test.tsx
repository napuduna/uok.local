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
});
