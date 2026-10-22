import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Service } from "@/types/models";
import { BookingProvider, useBooking } from "./BookingContext";
import { StepIndicator } from "./StepIndicator";
import { DetailsStep } from "./steps/DetailsStep";
import { ServiceStep } from "./steps/ServiceStep";

const lamination: Service = {
  id: "11111111-1111-4111-8111-111111111111",
  category: "brows",
  slug: "brow-lamination",
  name_ar: "رفع الحواجب",
  name_en: "Brow Lamination",
  description_ar: "يشمل تنظيف الحواجب والشارب.",
  description_en: null,
  price_agorot: 22000,
  duration_minutes: 75,
  image_path: null,
  location_required: false,
  is_active: true,
  sort_order: 1,
  service_addons: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      service_id: "11111111-1111-4111-8111-111111111111",
      slug: "eyebrow-tint",
      name_ar: "صبغة الحواجب",
      name_en: "Eyebrow Tint",
      description_ar: null,
      price_agorot: 1000,
      extra_duration_minutes: 0,
      is_active: true,
      sort_order: 1,
    },
  ],
  service_locations: [],
};

function StateProbe() {
  const { state } = useBooking();
  return <output data-testid="state">{JSON.stringify({ serviceId: state.serviceId, addonIds: state.addonIds, name: state.customerName })}</output>;
}

function renderWithBooking(ui: React.ReactNode) {
  sessionStorage.clear();
  return render(
    <MemoryRouter>
      <BookingProvider>
        {ui}
        <StateProbe />
      </BookingProvider>
    </MemoryRouter>,
  );
}

describe("ServiceStep", () => {
  it("shows Arabic and English names, price, duration and the tint add-on without extra time", async () => {
    const user = userEvent.setup();
    renderWithBooking(<ServiceStep services={[lamination]} />);
    expect(screen.getByText("رفع الحواجب")).toBeInTheDocument();
    expect(screen.getByText("Brow Lamination")).toBeInTheDocument();
    expect(screen.getByText(/₪220/)).toBeInTheDocument();
    expect(screen.getByText("ساعة و15 دقيقة")).toBeInTheDocument();

    await user.click(screen.getByTestId("service-brow-lamination"));
    expect(screen.getByRole("radio", { checked: true })).toBeInTheDocument();
    expect(screen.getByText("صبغة الحواجب")).toBeInTheDocument();
    expect(screen.getByText("بدون وقت إضافي")).toBeInTheDocument();
    expect(screen.getByText(/\+.*₪10/)).toBeInTheDocument();

    await user.click(screen.getByTestId("addon-eyebrow-tint"));
    expect(screen.getByTestId("state").textContent).toContain("22222222-2222-4222-8222-222222222222");
  });
});

describe("DetailsStep", () => {
  it("shows Arabic validation errors for an invalid phone number", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderWithBooking(<DetailsStep onDone={onDone} />);
    await user.type(screen.getByLabelText("الاسم الكامل"), "دنيا أحمد");
    await user.type(screen.getByLabelText("رقم الهاتف"), "02-1234567");
    await user.click(screen.getByRole("button", { name: "التالي" }));
    expect(await screen.findByText(/رقم هاتف محمول صحيح/)).toBeInTheDocument();
    expect(screen.getByLabelText("رقم الهاتف")).toHaveAttribute("aria-invalid", "true");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("accepts a valid Israeli mobile and stores the details", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderWithBooking(<DetailsStep onDone={onDone} />);
    await user.type(screen.getByLabelText("الاسم الكامل"), "دنيا أحمد");
    await user.type(screen.getByLabelText("رقم الهاتف"), "054-123-4567");
    await user.click(screen.getByRole("button", { name: "التالي" }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(screen.getByTestId("state").textContent).toContain("دنيا أحمد");
  });
});

describe("StepIndicator", () => {
  it("marks the current step and only allows reachable steps", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<StepIndicator current={2} maxReachable={2} onSelect={onSelect} />);
    expect(screen.getByRole("button", { current: "step" })).toHaveTextContent("الموعد");
    expect(screen.getByRole("button", { name: /التأكيد/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /الخدمة/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
