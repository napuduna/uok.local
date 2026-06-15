import { expect, test, type Page } from "@playwright/test";

const adminEmail = "admin@uok.local";
const salesEmail = "sales.e2e@uok.local";
const password = process.env.E2E_USER_PASSWORD ?? "ChangeMe123!";
const productId = "ac1d9514-b32e-4d03-865b-b46353705fe8";
const lotId = "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL("/");
}

test("admin reviews and confirms a lot adjustment", async ({ page }) => {
  await page.route("**/api/v1/products/*/lots?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: lotId,
            lotNumber: "E2E-LOT-ADJUST",
            product: {
              id: productId,
              code: "E2E-STOCK-IN-PRODUCT",
              name: "สินค้าทดสอบรับเข้า"
            },
            warehouse: {
              id: "880f2aa8-d669-482f-93bc-cf986cad81ac",
              code: "MAIN",
              name: "คลังหลัก"
            },
            receivedAt: "2026-06-15T00:00:00.000Z",
            expiryDate: null,
            unitCost: "20.00",
            receivedQuantity: 100,
            received: 100,
            sold: 0,
            adjusted: 0,
            availableQuantity: 100,
            isActive: true,
            createdAt: "2026-06-15T00:00:00.000Z"
          }
        ],
        page: 1,
        pageSize: 100,
        total: 1
      })
    });
  });
  await page.route("**/api/v1/adjustments", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "8f8f233f-79d6-4499-b61d-abef2535f6d8",
        referenceNumber: "E2E-ADJ-REVIEW",
        direction: "DECREASE",
        quantity: 25,
        quantityDelta: -25,
        reason: "สินค้าชำรุด",
        product: {
          id: productId,
          code: "E2E-STOCK-IN-PRODUCT",
          name: "สินค้าทดสอบรับเข้า"
        },
        lot: { id: lotId, lotNumber: "E2E-LOT-ADJUST" },
        warehouse: {
          id: "880f2aa8-d669-482f-93bc-cf986cad81ac",
          code: "MAIN",
          name: "คลังหลัก"
        },
        beforeQuantity: 100,
        afterQuantity: 75,
        createdBy: {
          id: "cf4dbeb7-bbf5-4190-adf2-2f0ebd037e88",
          name: "Admin"
        },
        createdAt: "2026-06-15T01:00:00.000Z"
      })
    });
  });

  await login(page, adminEmail);
  await page.goto("/adjustments");

  await page
    .getByLabel("สินค้า")
    .selectOption({ label: "E2E-STOCK-IN-PRODUCT · สินค้าทดสอบรับเข้า" });
  await page.getByLabel("เลขที่อ้างอิง").fill("E2E-ADJ-REVIEW");
  await page.getByLabel("LOT").selectOption(lotId);
  await page.getByRole("radio", { name: "ลดสต๊อก" }).check();
  await page.getByLabel("จำนวน").fill("25");
  await page.getByLabel("เหตุผล").fill("สินค้าชำรุด");
  await page.getByRole("button", { name: "ตรวจสอบรายการ" }).click();

  await expect(
    page.getByRole("heading", { name: "ตรวจสอบก่อนปรับสต๊อก" })
  ).toBeVisible();
  await expect(page.getByText("75 ชิ้น")).toBeVisible();
  await page.getByRole("button", { name: "ยืนยันปรับสต๊อก" }).click();
  await expect(
    page.getByRole("heading", { name: "E2E-ADJ-REVIEW" })
  ).toBeVisible();
});

test("sales cannot access adjustment navigation or API", async ({ page }) => {
  await login(page, salesEmail);
  await expect(page.getByRole("link", { name: "ปรับสต๊อก" })).toHaveCount(0);

  const response = await page.request.post("/api/v1/adjustments", {
    headers: { "idempotency-key": crypto.randomUUID() },
    data: {
      referenceNumber: "E2E-ADJ-SALES-DENIED",
      lotId,
      direction: "INCREASE",
      quantity: 1,
      reason: "ทดสอบสิทธิ์"
    }
  });
  expect(response.status()).toBe(403);
});
