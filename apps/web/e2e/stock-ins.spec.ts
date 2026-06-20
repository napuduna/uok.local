import { expect, test, type Page } from "@playwright/test";

const adminEmail = "admin@uok.local";
const salesEmail = "sales.e2e@uok.local";
const password = process.env.E2E_USER_PASSWORD ?? "ChangeMe123!";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL("/");
}

test("admin reviews a stock-in receipt before confirmation", async ({ page }) => {
  await login(page, adminEmail);
  await page.goto("/stock-ins");

  await page.getByLabel("เลขที่อ้างอิง").fill("E2E-SI-REVIEW");
  await page
    .getByLabel("สินค้า รายการ 1")
    .selectOption({ label: "E2E-STOCK-IN-PRODUCT · สินค้าทดสอบรับเข้า" });
  await page.getByLabel("LOT รายการ 1").fill("E2E-LOT-REVIEW");
  await page.getByLabel("จำนวน รายการ 1").fill("25");
  await page.getByLabel("ต้นทุนต่อหน่วย รายการ 1").fill("18.50");
  await page.getByRole("button", { name: "ตรวจสอบรายการ" }).click();

  await expect(
    page.getByRole("heading", { name: "ตรวจสอบก่อนรับสินค้า" })
  ).toBeVisible();
  await expect(page.getByText("E2E-LOT-REVIEW")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ยืนยันรับสินค้า" })
  ).toBeVisible();
});

test("sales cannot access stock-in navigation or API", async ({ page }) => {
  await login(page, salesEmail);

  await expect(
    page.getByRole("link", { name: "รับสินค้าเข้า" })
  ).toHaveCount(0);

  const response = await page.request.post("/api/v1/stock-ins", {
    headers: { "idempotency-key": crypto.randomUUID() },
    data: {
      referenceNumber: "SALES-DENIED",
      receivedAt: "2026-06-15T00:00:00+07:00",
      items: [
        {
          productId: "00000000-0000-4000-8000-000000000000",
          lotNumber: "SALES-DENIED",
          expiryDate: null,
          quantity: 1,
          unitCost: "1.00"
        }
      ]
    }
  });

  expect(response.status()).toBe(403);
});
