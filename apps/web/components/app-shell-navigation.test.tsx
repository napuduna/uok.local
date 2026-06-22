import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardShell } from "./dashboard-shell";

describe("application shell navigation", () => {
  it("links to the product workspace and renders page content", () => {
    render(
      <DashboardShell pageTitle="สินค้า" activePath="/products">
        <div>พื้นที่จัดการสินค้า</div>
      </DashboardShell>
    );

    expect(screen.getByRole("link", { name: "สินค้า" })).toHaveAttribute(
      "href",
      "/products"
    );
    expect(screen.getByText("พื้นที่จัดการสินค้า")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "สินค้า" })).toBeInTheDocument();
  });
});
