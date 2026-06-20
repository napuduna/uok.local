import { expect, test, type Page } from "@playwright/test";

const salesEmail = "sales.e2e@uok.local";
const password = process.env.E2E_USER_PASSWORD ?? "ChangeMe123!";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(salesEmail);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL("/");
}

test("sales reviews customer, availability and total before confirmation", async ({
  page
}) => {
  await login(page);
  await page.goto("/sales");

  await page.getByRole("button", { name: "สร้างบิลขาย" }).click();
  await page
    .getByRole("combobox", { name: "ลูกค้า" })
    .selectOption({ label: "E2E-SALE-CUSTOMER · ลูกค้า ทดสอบการขาย" });
  const product = page.getByRole("button", {
    name: /E2E-SALE-PRODUCT/
  });
  await expect(product).toContainText("คงเหลือ 1,000 ชิ้น");
  await product.click();
  await page.getByRole("spinbutton", {
    name: "จำนวน E2E-SALE-PRODUCT"
  }).fill("3");

  await page.getByRole("button", { name: /ตรวจสอบรายการ/ }).click();
  await expect(
    page.getByRole("heading", { name: "ตรวจสอบก่อนบันทึกการขาย" })
  ).toBeVisible();
  await expect(page.locator(".sales-review-total")).toHaveText("฿90.00");
  await expect(
    page.getByRole("button", { name: "ยืนยันบันทึกการขาย" })
  ).toBeVisible();
});
