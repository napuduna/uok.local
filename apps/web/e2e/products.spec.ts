import { expect, test, type Page } from "@playwright/test";

const adminEmail = "admin@uok.local";
const salesEmail = "sales.e2e@uok.local";
const password = process.env.E2E_USER_PASSWORD ?? "ChangeMe123!";
const productCode = "E2E-PRODUCT-AUTO";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL("/");
}

test("admin creates and archives a product", async ({ page }) => {
  await login(page, adminEmail);
  await page.goto("/products");

  await page.getByRole("button", { name: "เพิ่มสินค้า" }).click();
  await page.getByRole("textbox", { name: "รหัสสินค้า" }).fill(productCode);
  await page
    .getByRole("textbox", { name: "ชื่อสินค้า" })
    .fill("สินค้าทดสอบอัตโนมัติ");
  await page.getByRole("textbox", { name: "ราคาขาย (บาท)" }).fill("125.50");
  await expect(
    page.getByRole("spinbutton", { name: "จุดแจ้งเตือนสต๊อกต่ำ" })
  ).toHaveValue("50");
  await page.getByRole("button", { name: "บันทึกสินค้า" }).click();

  const productRow = page.getByRole("row", { name: new RegExp(productCode) });
  await expect(productRow).toContainText("฿125.50");

  await page.getByRole("link", { name: productCode }).click();
  await expect(
    page.getByRole("heading", {
      name: `${productCode} · สินค้าทดสอบอัตโนมัติ`
    })
  ).toBeVisible();
  await expect(page.getByText("Ledger ตรงกับยอดคงเหลือ")).toBeVisible();
  await page.getByRole("link", { name: "กลับไปรายการสินค้า" }).click();

  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `เก็บ ${productCode} เข้าประวัติ` })
    .click();
  await expect(productRow).toHaveCount(0);
});

test("sales can read products but cannot mutate them", async ({ page }) => {
  await login(page, salesEmail);
  await page.goto("/products");

  await expect(
    page.getByRole("heading", { name: "รายการสินค้า" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "เพิ่มสินค้า" })).toHaveCount(
    0
  );

  const response = await page.request.post("/api/v1/products", {
    data: {
      code: "SALES-DENIED",
      name: "Sales denied",
      categoryId: "00000000-0000-4000-8000-000000000000",
      unitId: "00000000-0000-4000-8000-000000000000",
      salePrice: "1.00"
    }
  });

  expect(response.status()).toBe(403);
});
