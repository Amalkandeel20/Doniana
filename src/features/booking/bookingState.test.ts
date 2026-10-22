import { describe, expect, it } from "vitest";
import { bookingReducer, emptyDraft, maxReachableStep, submissionSignature, type BookingDraft } from "./bookingState";

const slot = { startsAt: "2026-11-02T08:00:00.000Z", time: "10:00" };
const filled: BookingDraft = {
  ...emptyDraft,
  category: "brows",
  serviceId: "svc-1",
  date: "2026-11-02",
  slot,
  customerName: "دنيا",
  customerPhone: "0541234567",
  step: 4,
};

describe("booking draft", () => {
  it("clears an incompatible time when the service changes", () => {
    const next = bookingReducer(filled, { type: "selectService", serviceId: "svc-2" });
    expect(next.slot).toBeNull();
    expect(next.date).toBe("2026-11-02");
    expect(next.customerName).toBe("دنيا");
  });

  it("keeps the time when re-selecting the same service", () => {
    expect(bookingReducer(filled, { type: "selectService", serviceId: "svc-1" }).slot).toEqual(slot);
  });

  it("clears the time when the date or add-ons change", () => {
    expect(bookingReducer(filled, { type: "setDate", date: "2026-11-03" }).slot).toBeNull();
    expect(bookingReducer(filled, { type: "setDate", date: "2026-11-02" }).slot).toEqual(slot);
    expect(bookingReducer(filled, { type: "toggleAddon", addonId: "tint" }).slot).toBeNull();
  });

  it("keeps entered details when navigating back", () => {
    const back = bookingReducer(filled, { type: "goTo", step: 1 });
    expect(back).toMatchObject({ step: 1, customerName: "دنيا", customerPhone: "0541234567", slot });
  });

  it("never jumps past the furthest reachable step", () => {
    const noSlot = { ...filled, slot: null };
    expect(bookingReducer(noSlot, { type: "goTo", step: 4 }).step).toBe(2);
    expect(maxReachableStep({ ...filled, locationId: null }, true)).toBe(1);
    expect(maxReachableStep(filled)).toBe(4);
  });

  it("returns to the time step when the slot was taken", () => {
    expect(bookingReducer(filled, { type: "slotTaken" })).toMatchObject({ step: 2, slot: null });
  });

  it("binds the idempotency key to the exact payload", () => {
    const a = submissionSignature(filled, "+972541234567");
    expect(submissionSignature({ ...filled }, "+972541234567")).toBe(a);
    expect(submissionSignature({ ...filled, slot: { ...slot, startsAt: "2026-11-02T08:15:00.000Z" } }, "+972541234567")).not.toBe(a);
  });

  it("keeps contact details but resets the rest when switching category", () => {
    const next = bookingReducer(filled, { type: "setCategory", category: "piercing" });
    expect(next).toMatchObject({ category: "piercing", serviceId: null, slot: null, customerName: "دنيا" });
  });
});
