import { describe, expect, it } from "vitest";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://proxy";

describe("reverse proxy smoke test", () => {
  it("routes API health traffic", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      service: "api",
      status: "ok"
    });
  });

  it("routes web traffic to the authenticated application", async () => {
    const response = await fetch(`${baseUrl}/login`);

    expect(response.ok).toBe(true);
    expect(await response.text()).toContain("เข้าสู่ระบบคลังสินค้า");
  });
});
