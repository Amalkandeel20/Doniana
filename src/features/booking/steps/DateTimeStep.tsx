import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { ApiError, callFunction } from "@/lib/api";
import { formatLocalDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AvailabilityResponse } from "@/types/models";
import { addDaysToLocalDate, toZonedParts } from "@shared/domain/time.ts";
import { useBooking } from "../BookingContext";

const WINDOW_DAYS = 14;

export function DateTimeStep() {
  const { state, dispatch } = useBooking();
  const today = toZonedParts(new Date()).date;
  const [windowStart, setWindowStart] = useState(today);

  // Always fetched fresh when this step opens, so customers only ever see currently free times.
  const availability = useAsync(
    () =>
      callFunction<AvailabilityResponse>("availability", {
        serviceId: state.serviceId,
        addonIds: state.addonIds,
        locationId: state.locationId,
        fromDate: windowStart,
        days: WINDOW_DAYS,
      }),
    [state.serviceId, state.addonIds.join(","), state.locationId, windowStart],
  );

  const days = useMemo(() => availability.data?.days ?? [], [availability.data]);
  const selectedDay = days.find((d) => d.date === state.date);

  // Pick the first day with free times; drop a previously chosen slot that is no longer offered.
  useEffect(() => {
    if (!days.length) return;
    if (!state.date || !days.some((d) => d.date === state.date)) {
      const first = days.find((d) => d.slots.length);
      if (first) dispatch({ type: "setDate", date: first.date });
      return;
    }
    if (state.slot && !selectedDay?.slots.some((s) => s.startsAt === state.slot!.startsAt)) {
      dispatch({ type: "setSlot", slot: null });
    }
  }, [days, state.date, state.slot, selectedDay, dispatch]);

  const anySlots = days.some((d) => d.slots.length);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">{t("booking.datetime.title")}</h2>

      {availability.loading && !availability.data && <Spinner label={t("booking.datetime.loading")} className="py-10" />}

      {availability.error !== undefined && (
        <div role="alert" className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5">
          <p>{availability.error instanceof ApiError && availability.error.code === "rate_limited" ? t("booking.errors.rate_limited") : t("booking.datetime.error")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={availability.reload}>
            {t("booking.datetime.retry")}
          </Button>
        </div>
      )}

      {days.length > 0 && (
        <>
          <div className="-mx-5 overflow-x-auto px-5 no-scrollbar sm:mx-0 sm:px-0">
            <ul className="flex gap-2 pb-1" role="listbox" aria-label={t("booking.review.date")}>
              {days.map((d, i) => {
                const { weekday, day, month } = formatLocalDateShort(d.date);
                const active = d.date === state.date;
                const disabled = d.slots.length === 0;
                const label = d.date === today ? t("booking.datetime.today") : d.date === addDaysToLocalDate(today, 1) ? t("booking.datetime.tomorrow") : weekday;
                return (
                  <li key={d.date}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-disabled={disabled}
                      disabled={disabled}
                      data-testid={`day-${d.date}`}
                      onClick={() => dispatch({ type: "setDate", date: d.date })}
                      className={cn(
                        "flex w-[4.5rem] flex-col items-center gap-0.5 rounded-2xl border px-2 py-3 transition-colors",
                        active ? "border-ink bg-ink text-ivory" : "bg-white hover:bg-secondary",
                        disabled && "cursor-not-allowed bg-muted/60 text-muted-foreground line-through decoration-1 hover:bg-muted/60",
                        i === 0 && "ms-0",
                      )}
                    >
                      <span className="text-xs">{label}</span>
                      <span className="text-xl font-semibold">{day}</span>
                      <span className="ltr text-[0.7rem] opacity-70">
                        {day}/{month}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => setWindowStart(addDaysToLocalDate(windowStart, WINDOW_DAYS))}
                  className="flex h-full w-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed bg-white px-2 text-xs hover:bg-secondary"
                >
                  <ChevronLeft className="size-5" aria-hidden />
                  {t("booking.datetime.moreDays")}
                </button>
              </li>
            </ul>
          </div>
          {windowStart !== today && (
            <Button variant="link" size="sm" onClick={() => setWindowStart(today)}>
              {t("booking.datetime.today")}
            </Button>
          )}

          {!anySlots && !availability.loading && <p className="rounded-3xl bg-secondary p-5 text-center">{t("booking.datetime.noDays")}</p>}

          {selectedDay && (
            <section aria-labelledby="slots-title">
              <h3 id="slots-title" className="mb-3 font-semibold">
                {t("booking.datetime.selectTime")}
              </h3>
              {selectedDay.slots.length === 0 ? (
                <p className="rounded-3xl bg-secondary p-5 text-center" data-testid="no-slots">
                  {t("booking.datetime.noSlots")}
                </p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="listbox" aria-labelledby="slots-title">
                  {selectedDay.slots.map((s) => {
                    const active = state.slot?.startsAt === s.startsAt;
                    return (
                      <li key={s.startsAt}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          data-testid={`slot-${s.time}`}
                          onClick={() => dispatch({ type: "setSlot", slot: s })}
                          className={cn(
                            "ltr h-12 w-full rounded-2xl border text-base font-medium tabular-nums transition-colors",
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
          )}
        </>
      )}
    </div>
  );
}
