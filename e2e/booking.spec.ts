import { expect, test, type Page } from "@playwright/test";
import { blockDayExcept, cancelAllFutureAppointments, localDate, offsetFor, resetSchedule, seedAppointment } from "./support/db";

const PHONE = "054-123-4567";

test.beforeEach(async () => {
  await resetSchedule();
  await cancelAllFutureAppointments();
});

/** Shows the month containing `date` in the booking calendar and returns that day button. */
async function dayButton(page: Page, date: string) {
  await expect(page.getByTestId("month-next")).toBeVisible();
  for (let i = 0; i < 3 && (await page.getByTestId(`day-${date}`).count()) === 0; i++) {
    await page.getByTestId("month-next").click();
  }
  return page.getByTestId(`day-${date}`);
}

async function pickDate(page: Page, date: string) {
  await (await dayButton(page, date)).click();
}

async function fillDetails(page: Page, name = "دنيا اختبار", phone = PHONE) {
  await page.getByLabel("الاسم الكامل").fill(name);
  await page.getByLabel("رقم الهاتف").fill(phone);
  await page.getByTestId("step-next").click();
}

test("Arabic RTL rendering", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: /DONIANA/ }).first()).toBeVisible();
});

test("brows: book, manage, cancel and the time becomes available again @mobile", async ({ page }) => {
  const date = localDate(3);

  // 1–2. Home → Brows
  await page.goto("/");
  await page.getByTestId("hero-book").click();
  await page.getByTestId("category-brows").click();

  // 3. Service (lamination + tint: ₪230, still 75 minutes)
  await page.getByTestId("service-brow-lamination").click();
  await page.getByTestId("addon-eyebrow-tint").check();
  await page.getByTestId("step-next").click();

  // 4. Date & time
  await pickDate(page, date);
  await page.getByTestId("slot-10:00").click();
  await page.getByTestId("step-next").click();

  // 5. Details
  await fillDetails(page);

  // 6. Review
  const summary = page.getByTestId("review-summary");
  await expect(summary).toContainText("رفع الحواجب");
  await expect(summary).toContainText("صبغة الحواجب");
  await expect(summary).toContainText("10:00");
  await expect(summary).toContainText("ساعة و15 دقيقة");
  await expect(page.getByTestId("review-total")).toContainText("₪230");

  // 7. Confirm (double click must not create two bookings)
  await page.getByTestId("confirm-booking").dblclick();
  await expect(page.getByTestId("booking-success")).toBeVisible();
  await expect(page.getByTestId("booking-reference")).toHaveText(/^DN-/);

  // Add to calendar downloads an .ics file for this booking
  const download = page.waitForEvent("download");
  await page.getByTestId("add-to-calendar").click();
  expect((await download).suggestedFilename()).toMatch(/^doniana-DN-[A-Z2-9]{6}\.ics$/);

  // 8. Private management link
  await page.getByTestId("manage-link").click();
  await expect(page.getByTestId("manage-view")).toBeVisible();
  await expect(page.getByTestId("manage-status")).toHaveText("مؤكَّد");

  // 9. Cancel (more than 24h ahead → allowed)
  await page.getByTestId("cancel-appointment").click();
  await page.getByRole("button", { name: "نعم، إلغاء الموعد" }).click();
  await expect(page.getByTestId("manage-status")).toHaveText("ملغى");

  // 10. The slot is offered again
  await page.goto("/book/brows");
  await page.getByTestId("service-brow-lamination").click();
  await page.getByTestId("step-next").click();
  await pickDate(page, date);
  await expect(page.getByTestId("slot-10:00")).toBeVisible();
});

test("a booked time disappears for the next customer, including overlapping starts", async ({ page }) => {
  const date = localDate(4);
  await page.goto("/book/brows");
  await page.getByTestId("service-brow-lamination").click(); // 75 minutes
  await page.getByTestId("step-next").click();
  await pickDate(page, date);
  await page.getByTestId("slot-11:00").click();
  await page.getByTestId("step-next").click();
  await fillDetails(page);
  await page.getByTestId("confirm-booking").click();
  await expect(page.getByTestId("booking-success")).toBeVisible();

  await page.getByRole("button", { name: "حجز موعد آخر" }).click();
  await page.getByTestId("service-eyebrow-shaping").click(); // 25 minutes
  await page.getByTestId("step-next").click();
  await pickDate(page, date);
  await expect(page.getByTestId("slot-10:30")).toBeVisible(); // ends 10:55
  await expect(page.getByTestId("slot-10:45")).toHaveCount(0); // would overlap 11:00
  await expect(page.getByTestId("slot-11:00")).toHaveCount(0);
  await expect(page.getByTestId("slot-12:00")).toHaveCount(0);
  await expect(page.getByTestId("slot-12:15")).toBeVisible();
});

test("piercing booking requires a location and keeps the base price", async ({ page }) => {
  await page.goto("/book");
  await page.getByTestId("category-piercing").click();
  await page.getByTestId("service-body-piercing").click();
  await expect(page.getByTestId("step-next")).toBeDisabled();
  await page.getByTestId("location-nose").click();
  await page.getByTestId("step-next").click();
  await pickDate(page, localDate(5));
  await page.getByTestId("slot-09:00").click();
  await page.getByTestId("step-next").click();
  await fillDetails(page);
  await expect(page.getByTestId("review-summary")).toContainText("الأنف");
  await expect(page.getByTestId("review-total")).toContainText("₪150");
  await page.getByTestId("confirm-booking").click();
  await expect(page.getByTestId("booking-success")).toBeVisible();
});

test("tomorrow is bookable (no 24-hour minimum)", async ({ page }) => {
  await page.goto("/book/brows");
  await page.getByTestId("service-eyebrow-shaping").click();
  await page.getByTestId("step-next").click();
  await expect(await dayButton(page, localDate(1))).toBeEnabled();
  await pickDate(page, localDate(1));
  await expect(page.getByTestId("slot-08:00")).toBeVisible();
});

test("fully booked day shows no times", async ({ page }) => {
  const date = localDate(6);
  await blockDayExcept(date, 10, 11);
  await seedAppointment(new Date(`${date}T10:00:00${offsetFor(date)}`), "eyebrow-shaping-facial"); // 60 min fills 10–11
  await page.goto("/book/brows");
  await page.getByTestId("service-eyebrow-shaping").click();
  await page.getByTestId("step-next").click();
  await expect(await dayButton(page, date)).toBeDisabled();
});

test("invalid phone numbers are rejected with an Arabic message", async ({ page }) => {
  await page.goto("/book/brows");
  await page.getByTestId("service-eyebrow-shaping").click();
  await page.getByTestId("step-next").click();
  await pickDate(page, localDate(3));
  await page.getByTestId("slot-09:00").click();
  await page.getByTestId("step-next").click();
  await fillDetails(page, "دنيا اختبار", "02-123-4567");
  await expect(page.getByText(/رقم هاتف محمول صحيح/)).toBeVisible();
  await expect(page.getByTestId("review-summary")).toHaveCount(0);
});

test("mobile layout has no horizontal overflow @mobile", async ({ page }) => {
  for (const path of ["/", "/book", "/book/brows"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
