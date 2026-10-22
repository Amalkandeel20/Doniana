import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { bookingReducer, loadDraft, saveDraft, type BookingAction, type BookingDraft } from "./bookingState";

const BookingContext = createContext<{ state: BookingDraft; dispatch: Dispatch<BookingAction> } | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(bookingReducer, undefined, loadDraft);
  useEffect(() => saveDraft(state), [state]);
  return <BookingContext.Provider value={{ state, dispatch }}>{children}</BookingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used inside <BookingProvider>");
  return ctx;
}
