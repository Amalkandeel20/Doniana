// Booking draft state machine (pure, unit-tested). Persisted in sessionStorage so customers can
// go back and forth — or reload — without losing what they entered.
import type { ServiceCategory } from "@/types/models";

export type Step = 1 | 2 | 3 | 4;

export interface SelectedSlot {
  startsAt: string;
  time: string;
}

export interface BookingDraft {
  category: ServiceCategory | null;
  serviceId: string | null;
  addonIds: string[];
  locationId: string | null;
  date: string | null;
  slot: SelectedSlot | null;
  customerName: string;
  customerPhone: string;
  step: Step;
  /** Idempotency key bound to the exact payload it was created for. */
  submission: { key: string; signature: string } | null;
}

export const emptyDraft: BookingDraft = {
  category: null,
  serviceId: null,
  addonIds: [],
  locationId: null,
  date: null,
  slot: null,
  customerName: "",
  customerPhone: "",
  step: 1,
  submission: null,
};

export type BookingAction =
  | { type: "setCategory"; category: ServiceCategory }
  | { type: "selectService"; serviceId: string }
  | { type: "toggleAddon"; addonId: string }
  | { type: "setLocation"; locationId: string }
  | { type: "setDate"; date: string }
  | { type: "setSlot"; slot: SelectedSlot | null }
  | { type: "setDetails"; customerName: string; customerPhone: string }
  | { type: "goTo"; step: Step }
  | { type: "slotTaken" }
  | { type: "bindSubmission"; key: string; signature: string }
  | { type: "reset"; category?: ServiceCategory };

export function bookingReducer(state: BookingDraft, action: BookingAction): BookingDraft {
  switch (action.type) {
    case "setCategory":
      return state.category === action.category ? state : { ...emptyDraft, category: action.category, customerName: state.customerName, customerPhone: state.customerPhone };
    case "selectService":
      if (state.serviceId === action.serviceId) return state;
      // A different service has a different duration: the chosen time may no longer fit.
      return { ...state, serviceId: action.serviceId, addonIds: [], locationId: null, slot: null };
    case "toggleAddon": {
      const has = state.addonIds.includes(action.addonId);
      const addonIds = has ? state.addonIds.filter((id) => id !== action.addonId) : [...state.addonIds, action.addonId];
      // Add-ons may add time, so revalidate the slot by asking for a new one.
      return { ...state, addonIds, slot: null };
    }
    case "setLocation":
      return state.locationId === action.locationId ? state : { ...state, locationId: action.locationId, slot: null };
    case "setDate":
      return state.date === action.date ? state : { ...state, date: action.date, slot: null };
    case "setSlot":
      return { ...state, slot: action.slot };
    case "setDetails":
      return { ...state, customerName: action.customerName, customerPhone: action.customerPhone };
    case "goTo":
      return { ...state, step: Math.min(action.step, maxReachableStep(state)) as Step };
    case "slotTaken":
      return { ...state, slot: null, step: 2 };
    case "bindSubmission":
      return { ...state, submission: { key: action.key, signature: action.signature } };
    case "reset":
      return { ...emptyDraft, category: action.category ?? null };
  }
}

export function maxReachableStep(state: BookingDraft, locationRequired = false): Step {
  if (!state.serviceId || (locationRequired && !state.locationId)) return 1;
  if (!state.slot) return 2;
  if (!state.customerName || !state.customerPhone) return 3;
  return 4;
}

export function submissionSignature(state: BookingDraft, normalizedPhone: string): string {
  return JSON.stringify([
    state.serviceId,
    [...state.addonIds].sort(),
    state.locationId,
    state.slot?.startsAt,
    state.customerName.trim(),
    normalizedPhone,
  ]);
}

const STORAGE_KEY = "doniana.booking.draft.v1";

export function loadDraft(): BookingDraft {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...emptyDraft, ...(JSON.parse(raw) as Partial<BookingDraft>) } : emptyDraft;
  } catch {
    return emptyDraft;
  }
}

export function saveDraft(draft: BookingDraft) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* private mode: state simply isn't persisted */
  }
}
