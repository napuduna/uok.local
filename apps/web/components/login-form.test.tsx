import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn()
  })
}));

describe("LoginForm", () => {
  it("renders an accessible Thai login form", () => {
    render(<LoginForm />);

    expect(
      screen.getByRole("heading", { name: "เข้าสู่ระบบคลังสินค้า" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("อีเมล")).toBeInTheDocument();
    expect(screen.getByLabelText("รหัสผ่าน")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "เข้าสู่ระบบ" })
    ).toBeInTheDocument();
  });
});
