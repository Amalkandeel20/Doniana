import { expect, test } from "@playwright/test";
import { cancelAllFutureAppointments, resetSchedule, seedAppointment } from "./support/db";

// The exact boundary (24h00m00s allowed, anything less denied) is proven against the database with
// an injected clock in tests/db/booking.test.ts. Here we check the real UI + API around it.
const HOUR = 3_600_000;

test.beforeEach(async () => {
  await resetSchedule();
  await cancelAllFutureAppointments();
});

test("cancellation allowed with just over 24 hours remaining", async ({ page }) => {
  const appt = await seedAppointment(new Date(Date.now() + 24 * HOUR + 3 * 60_000));
  await page.goto(`/a#${appt.token}`);
  await expect(page.getByTestId("cancel-appointment")).toBeEnabled();
  await page.getByTestId("cancel-appointment").click();
  await page.getByRole("button", { name: "نعم، إلغاء الموعد" }).click();
  await expect(page.getByTestId("manage-status")).toHaveText("ملغى");
});

test("cancellation refused with 23h59m remaining — UI and server", async ({ page, request }) => {
  const appt = await seedAppointment(new Date(Date.now() + 24 * HOUR - 60_000));
  await page.goto(`/a#${appt.token}`);
  await expect(page.getByTestId("cancel-appointment")).toBeDisabled();
  await expect(page.getByTestId("cutoff-message")).toHaveText(
    "لا يمكن إلغاء الموعد إذا تبقّى أقل من 24 ساعة على موعده. للاستفسار، يرجى التواصل معنا.",
  );

  // Bypassing the disabled button does not help: the server enforces the rule.
  const res = await request.post(`${process.env.VITE_SUPABASE_URL}/functions/v1/manage-appointment`, {
    data: { token: appt.token, action: "cancel" },
    headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY ?? "" },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toBe("cancellation_window_closed");
});

test("unknown or tampered links reveal nothing", async ({ page }) => {
  await page.goto(`/a#${"A".repeat(43)}`);
  await expect(page.getByTestId("manage-not-found")).toBeVisible();
});
