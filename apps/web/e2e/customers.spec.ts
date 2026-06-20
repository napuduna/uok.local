import { expect, test, type Page } from "@playwright/test";

const adminEmail = "admin@uok.local";
const password = process.env.E2E_USER_PASSWORD ?? "ChangeMe123!";
const customerCode = "E2E-CUSTOMER-AUTO";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(adminEmail);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL("/");
}

test("admin manages a customer and opens purchase history", async ({
  page
}) => {
  await login(page);
  await page.goto("/customers");

  await page.getByRole("button", { name: "เพิ่มลูกค้า" }).click();
  await page.getByRole("textbox", { name: "รหัสลูกค้า" }).fill(customerCode);
  await page.getByRole("textbox", { name: "ชื่อ", exact: true }).fill("สมชาย");
  await page.getByRole("textbox", { name: "นามสกุล" }).fill("ทดสอบ");
  await page.getByRole("spinbutton", { name: "อายุ" }).fill("35");
  await page.getByRole("combobox", { name: "เพศ" }).selectOption("MALE");
  await page.getByRole("textbox", { name: "โทรศัพท์" }).fill("081-234-5678");
  await page.getByRole("textbox", { name: "ที่อยู่" }).fill("กรุงเทพฯ");
  await page.getByRole("button", { name: "บันทึกลูกค้า" }).click();

  await page.getByRole("searchbox", { name: "ค้นหาลูกค้า" }).fill("0812345678");
  await page.getByRole("button", { name: "ค้นหา" }).click();
  const customerRow = page.getByRole("row", {
    name: new RegExp(customerCode)
  });
  await expect(customerRow).toContainText("081-234-5678");

  await page.getByRole("link", { name: customerCode }).click();
  await expect(
    page.getByRole("heading", {
      name: `${customerCode} · สมชาย ทดสอบ`
    })
  ).toBeVisible();
  await expect(page.getByText("ยังไม่มีประวัติการซื้อ")).toBeVisible();

  await page.getByRole("link", { name: "กลับไปรายการลูกค้า" }).click();
  await page.getByRole("searchbox", { name: "ค้นหาลูกค้า" }).fill(customerCode);
  await page.getByRole("button", { name: "ค้นหา" }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `เก็บ ${customerCode} เข้าประวัติ` })
    .click();
  await expect(customerRow).toHaveCount(0);
});
