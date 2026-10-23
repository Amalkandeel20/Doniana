import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fetchBusinessInfo } from "@/features/services/publicData";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { ApiError, callFunction } from "@/lib/api";
import { formatLocalDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AvailabilityResponse } from "@/types/models";
import { addDaysToLocalDate, localDateDiffDays, parseLocalDate, toZonedParts, weekdayOfLocalDate } from "@shared/domain/time.ts";
import { useBooking } from "../BookingContext";

// Sunday first, as on Israeli calendars. In RTL the grid runs right-to-left, so Sunday sits on the right.
const WEEKDAYS_SHORT = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const DEFAULT_HORIZON_DAYS = 60;

const monthLabelFormat = new Intl.DateTimeFormat("ar-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" });

/** Spoken label for a calendar day, e.g. "الأحد 25/10". */
function formatLocalDateAr(date: string): string {
  const { weekday, day, month } = formatLocalDateShort(date);
  return `${weekday} ${day}/${month}`;
}

/** "YYYY-MM" of a local date. */
const monthOf = (date: string) => date.slice(0, 7);

function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function DateTimeStep() {
  const { state, dispatch } = useBooking();
  const today = toZonedParts(new Date()).date;
  const [month, setMonth] = useState(() => monthOf(state.date && state.date >= today ? state.date : today));
  const info = useAsync(() => fetchBusinessInfo(), []);
  const lastBookable = addDaysToLocalDate(today, info.data?.settings?.booking_horizon_days ?? DEFAULT_HORIZON_DAYS);

  const allDays = useMemo(() => monthDays(month), [month]);
  const fromDate = allDays[0]! < today ? today : allDays[0]!;
  const fetchDays = localDateDiffDays(fromDate, allDays.at(-1)!) + 1;

  // Always fetched fresh when this step opens, so customers only ever see currently free times.
  const availability = useAsync(
    () =>
      callFunction<AvailabilityResponse>("availability", {
        serviceId: state.serviceId,
        addonIds: state.addonIds,
        locationId: state.locationId,
        fromDate,
        days: fetchDays,
      }),
    [state.serviceId, state.addonIds.join(","), state.locationId, fromDate, fetchDays],
  );

  const days = useMemo(() => availability.data?.days ?? [], [availability.data]);
  const slotsByDate = useMemo(() => new Map(days.map((d) => [d.date, d.slots])), [days]);
  const selectedSlots = state.date ? slotsByDate.get(state.date) : undefined;

  // Pick the first free day of the visible month; drop a chosen slot that is no longer offered.
  useEffect(() => {
    if (!days.length) return;
    if (!state.date || !slotsByDate.has(state.date)) {
      const first = days.find((d) => d.slots.length);
      if (first) dispatch({ type: "setDate", date: first.date });
      return;
    }
    if (state.slot && !selectedSlots?.some((s) => s.startsAt === state.slot!.startsAt)) {
      dispatch({ type: "setSlot", slot: null });
    }
  }, [days, slotsByDate, selectedSlots, state.date, state.slot, dispatch]);

  const { year, month: monthNumber } = parseLocalDate(allDays[0]!);
  const leadingBlanks = weekdayOfLocalDate(allDays[0]!);
  const canGoBack = month > monthOf(today);
  const canGoForward = `${shiftMonth(month, 1)}-01` <= lastBookable;
  const monthHasSlots = days.some((d) => d.slots.length);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">{t("booking.datetime.title")}</h2>

      {availability.error !== undefined && (
        <div role="alert" className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5">
          <p>
            {availability.error instanceof ApiError && availability.error.code === "rate_limited"
              ? t("booking.errors.rate_limited")
              : t("booking.datetime.error")}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={availability.reload}>
            {t("booking.datetime.retry")}
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
        {/* Month calendar */}
        <section aria-labelledby="month-title" className="rounded-3xl border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, -1))}
              disabled={!canGoBack}
              aria-label={t("booking.datetime.prevMonth")}
              data-testid="month-prev"
              className="grid size-10 place-items-center rounded-full hover:bg-secondary disabled:opacity-30"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <h3 id="month-title" className="font-semibold" aria-live="polite">
              {monthLabelFormat.format(new Date(Date.UTC(year, monthNumber - 1, 1)))}
            </h3>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={!canGoForward}
              aria-label={t("booking.datetime.nextMonth")}
              data-testid="month-next"
              className="grid size-10 place-items-center rounded-full hover:bg-secondary disabled:opacity-30"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center" aria-labelledby="month-title">
            <div className="contents">
              {WEEKDAYS_SHORT.map((w) => (
                <div key={w} aria-hidden className="pb-2 text-[0.7rem] font-medium text-muted-foreground">
                  {w}
                </div>
              ))}
            </div>
            <div className="contents">
              {Array.from({ length: leadingBlanks }, (_, i) => (
                <div key={`blank-${i}`} aria-hidden />
              ))}
              {allDays.map((date) => {
                const slots = slotsByDate.get(date);
                const bookable = !!slots?.length;
                const active = date === state.date;
                const isToday = date === today;
                return (
                  <div key={date}>
                    <button
                      type="button"
                      disabled={!bookable}
                      aria-pressed={active}
                      aria-label={`${formatLocalDateAr(date)}${isToday ? ` (${t("booking.datetime.today")})` : ""}`}
                      data-testid={`day-${date}`}
                      onClick={() => dispatch({ type: "setDate", date })}
                      className={cn(
                        "mx-auto grid aspect-square w-full max-w-11 place-items-center rounded-full text-sm tabular-nums transition-colors",
                        active && "bg-ink font-semibold text-ivory",
                        !active && bookable && "font-medium hover:bg-secondary",
                        !bookable && "cursor-not-allowed text-muted-foreground/45",
                        isToday && !active && "ring-1 ring-champagne",
                      )}
                    >
                      {Number(date.slice(8))}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {availability.loading && <Spinner label={t("booking.datetime.loading")} className="mt-3 flex justify-center text-sm" />}
          {!availability.loading && availability.data && !monthHasSlots && (
            <p className="mt-3 rounded-2xl bg-secondary p-3 text-center text-sm" data-testid="month-empty">
              {canGoForward ? t("booking.datetime.noSlotsMonth") : t("booking.datetime.noDays")}
            </p>
          )}
        </section>

        {/* Available times for the chosen day */}
        <section aria-labelledby="slots-title" className="rounded-3xl border bg-card p-4 sm:p-5">
          <h3 id="slots-title" className="mb-3 font-semibold">
            {t("booking.datetime.availableTimes")}
          </h3>
          {!state.date || !selectedSlots ? (
            <p className="text-sm text-muted-foreground">{t("booking.datetime.pickDay")}</p>
          ) : selectedSlots.length === 0 ? (
            <p className="rounded-2xl bg-secondary p-4 text-center text-sm" data-testid="no-slots">
              {t("booking.datetime.noSlots")}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 md:max-h-[22rem] md:grid-cols-1 md:overflow-y-auto md:pe-1" aria-labelledby="slots-title">
              {selectedSlots.map((s) => {
                const active = state.slot?.startsAt === s.startsAt;
                return (
                  <li key={s.startsAt}>
                    <button
                      type="button"
                      aria-pressed={active}
                      data-testid={`slot-${s.time}`}
                      onClick={() => dispatch({ type: "setSlot", slot: s })}
                      className={cn(
                        "ltr h-11 w-full rounded-2xl border text-base font-medium tabular-nums transition-colors",
                        active ? "border-ink bg-ink text-ivory" : "bg-white hover:border-ink/40 hover:bg-secondary",
                      )}
                    >
                      {s.time}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
