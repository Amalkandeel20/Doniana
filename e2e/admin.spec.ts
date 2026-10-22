import { expect, test, type Page } from "@playwright/test";
import { cancelAllFutureAppointments, localDate, resetSchedule } from "./support/db";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "owner@doniana.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "e2e-Owner-Password-1";

async function login(page: Page, email: string, password: string) {
  await page.goto("/admin");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByTestId("admin-login-submit").click();
}

test.beforeEach(async () => {
  await resetSchedule();
  await cancelAllFutureAppointments();
});

test("unauthenticated visitors only see the login form", async ({ page }) => {
  await page.goto("/admin/appointments");
  await expect(page.getByRole("heading", { name: "دخول الإدارة" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "لوحة الإدارة" })).toHaveCount(0);
});

test("wrong password is rejected", async ({ page }) => {
  await login(page, ADMIN_EMAIL, "wrong-password");
  await expect(page.getByText("البريد الإلكتروني أو كلمة المرور غير صحيحة.")).toBeVisible();
});

test("signed-in users without an admin profile are refused", async ({ page }) => {
  await login(page, "not-admin@doniana.test", "e2e-Not-Admin-Password-1");
  await expect(page.getByText("هذا الحساب لا يملك صلاحيات الإدارة.")).toBeVisible();
});

test("owner logs in, sees the calendar and creates an appointment manually @mobile", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page.getByRole("button", { name: /موعد جديد/ }).first()).toBeVisible();

  await page.getByRole("button", { name: /موعد جديد/ }).first().click();
  const dialog = page.getByRole("dialog");
  const service = dialog.locator("#appt-service");
  const shaping = await service.locator("option", { hasText: "تنظيف وتنسيق الحواجب + شارب" }).getAttribute("value");
  await service.selectOption(shaping!);
  await dialog.locator("#appt-date").fill(localDate(7));
  await dialog.locator("#appt-time").fill("12:00");
  await dialog.getByLabel("اسم الزبونة").fill("زبونة من الإدارة");
  await dialog.getByLabel("رقم الهاتف").fill("0527654321");
  await dialog.getByRole("button", { name: "إضافة الموعد" }).click();
  await expect(page.getByText("تمت إضافة الموعد").first()).toBeVisible();

  await page.goto("/admin/appointments");
  await page.locator("#appt-search").fill("052-765");
  await expect(page.getByText("زبونة من الإدارة").first()).toBeVisible();
});
