import { expect, test, type Page } from "@playwright/test";

const adminEmail = "admin@uok.local";
const salesFixtureEmail = "sales.e2e@uok.local";
const password = process.env.E2E_USER_PASSWORD ?? "ChangeMe123!";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL("/");
  await expect(page.locator(".app-shell")).toBeVisible();
}

test("redirects an anonymous user to the login page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL("/login");
  await expect(page.locator("form.login-form")).toBeVisible();
});

test("logs an admin in and invalidates the session on logout", async ({
  page
}) => {
  await login(page, adminEmail);

  const authenticated = await page.request.get("/api/v1/auth/me");
  expect(authenticated.status()).toBe(200);

  await page.locator(".topbar__actions > button.icon-button").last().click();

  await expect(page).toHaveURL("/login");
  const loggedOut = await page.request.get("/api/v1/auth/me");
  expect(loggedOut.status()).toBe(401);
});

test("hides admin navigation and rejects the Sales role at the users API", async ({
  page
}) => {
  await login(page, salesFixtureEmail);

  await expect(page.locator(".sidebar__nav .nav-item")).toHaveCount(5);

  const response = await page.request.get("/api/v1/users");
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    code: "PERMISSION_DENIED"
  });
});
