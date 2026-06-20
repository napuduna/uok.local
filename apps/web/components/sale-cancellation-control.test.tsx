import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SaleCancellationControl } from "./sale-cancellation-control";

describe("SaleCancellationControl", () => {
  it("requires a reason before cancelling a completed invoice", () => {
    render(
      <SaleCancellationControl
        saleId="9c4761db-f4ff-4f20-9f67-44e5f4c2d8ff"
        canCancel={true}
        status="COMPLETED"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "ยกเลิกบิล" }));
    expect(
      screen.getByRole("textbox", { name: "เหตุผลการยกเลิก" })
    ).toBeRequired();
    expect(
      screen.getByRole("button", { name: "ยืนยันยกเลิกทั้งบิล" })
    ).toBeDisabled();
  });

  it("does not show cancellation controls after cancellation", () => {
    render(
      <SaleCancellationControl
        saleId="9c4761db-f4ff-4f20-9f67-44e5f4c2d8ff"
        canCancel={true}
        status="CANCELLED"
      />
    );

    expect(screen.queryByRole("button", { name: "ยกเลิกบิล" })).toBeNull();
  });
});
