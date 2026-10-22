import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type { BusinessHoursInput, DatesSetArg, EventClickArg, EventContentArg, EventInput, LocaleInput } from "@fullcalendar/core";
import arLocale from "@fullcalendar/core/locales/ar";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import luxon3Plugin from "@fullcalendar/luxon3";
import timeGridPlugin from "@fullcalendar/timegrid";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Appointment, AppointmentStatus, BusinessHours } from "@/types/models";
import { BUSINESS_TIME_ZONE, minutesToTimeString, timeStringToMinutes, toZonedParts } from "@shared/domain/time.ts";
import { adminErrorMessage } from "../adminApi";
import { fetchAppointmentsInRange, fetchBusinessHours } from "../appointmentsData";
import { AppointmentDetailsDialog } from "../components/AppointmentDetailsDialog";
import { AppointmentFormDialog, type AppointmentPrefill } from "../components/AppointmentFormDialog";
import "../components/calendar.css";

const K = "admin.appointments";
const PHONE_QUERY = "(max-width: 767px)";

const VIEWS = [
  { type: "timeGridDay", label: `${K}.calendar.views.day` },
  { type: "timeGridWeek", label: `${K}.calendar.views.week` },
  { type: "dayGridMonth", label: `${K}.calendar.views.month` },
  { type: "listWeek", label: `${K}.calendar.views.list` },
] as const;

// "ar" with Latin digits, matching the rest of the app (dd/MM, 24h).
const locale: LocaleInput = {
  ...arLocale,
  code: "ar-u-nu-latn",
  buttonText: { ...arLocale.buttonText, today: t(`${K}.calendar.today`) },
  allDayText: t(`${K}.calendar.allDay`),
  noEventsText: t(`${K}.calendar.noEvents`),
  moreLinkText: (n: number) => t(`${K}.calendar.more`, { count: n }),
};

const TIME_FORMAT = { hour: "2-digit", minute: "2-digit", hour12: false } as const;

const COLORS: Record<AppointmentStatus, { bg: string; border: string; text: string }> = {
  confirmed: { bg: "#0a0a0a", border: "#0a0a0a", text: "#faf7f2" },
  completed: { bg: "#e7e2da", border: "#d6cfc4", text: "#4a443c" },
  cancelled: { bg: "#ffe4e6", border: "#fecdd3", text: "#9f1239" },
};

function useIsPhone() {
  const [isPhone, setIsPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isPhone;
}

function toBusinessHours(hours: BusinessHours[] | undefined): BusinessHoursInput {
  const open = (hours ?? []).filter((h) => h.is_open);
  if (!open.length) return false;
  return open.map((h) => ({ daysOfWeek: [h.weekday], startTime: h.open_time.slice(0, 5), endTime: h.close_time.slice(0, 5) }));
}

/** Visible hours: working hours plus any loaded appointment, rounded to whole hours. */
function visibleRange(hours: BusinessHours[] | undefined, appointments: Appointment[]) {
  let min = Infinity;
  let max = -Infinity;
  for (const h of hours ?? []) {
    if (!h.is_open) continue;
    min = Math.min(min, timeStringToMinutes(h.open_time.slice(0, 5)));
    max = Math.max(max, timeStringToMinutes(h.close_time.slice(0, 5)));
  }
  for (const a of appointments) {
    const start = toZonedParts(new Date(a.starts_at));
    const end = toZonedParts(new Date(a.ends_at));
    min = Math.min(min, start.minutesOfDay);
    max = Math.max(max, end.date === start.date ? end.minutesOfDay : 24 * 60);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { slotMinTime: "07:00", slotMaxTime: "22:00" };
  const from = Math.max(0, Math.floor(min / 60) * 60 - 60);
  const to = Math.min(24 * 60, Math.ceil(max / 60) * 60 + 60);
  return { slotMinTime: minutesToTimeString(from), slotMaxTime: to >= 24 * 60 ? "24:00" : minutesToTimeString(to) };
}

export default function CalendarPage() {
  const isPhone = useIsPhone();
  const calendarRef = useRef<FullCalendar>(null);
  const [viewType, setViewType] = useState<string>(isPhone ? "timeGridDay" : "timeGridWeek");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [prefill, setPrefill] = useState<AppointmentPrefill | null>(null);
  const hours = useAsync(fetchBusinessHours, []);

  useEffect(() => {
    if (!range) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchAppointmentsInRange(range.from, range.to)
      .then((rows) => active && setAppointments(rows))
      .catch((e: unknown) => active && setError(e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [range, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const onDatesSet = useCallback((arg: DatesSetArg) => {
    const from = new Date(arg.startStr).toISOString();
    const to = new Date(arg.endStr).toISOString();
    setRange((r) => (r && r.from === from && r.to === to ? r : { from, to }));
    setViewType(arg.view.type);
  }, []);

  const events = useMemo<EventInput[]>(
    () =>
      appointments
        .filter((a) => showCancelled || a.status !== "cancelled")
        .map((a) => ({
          id: a.id,
          start: a.starts_at,
          end: a.ends_at,
          title: `${a.customer_name ?? "—"} · ${a.service_name_ar}`,
          backgroundColor: COLORS[a.status].bg,
          borderColor: COLORS[a.status].border,
          textColor: COLORS[a.status].text,
          classNames: ["dn-ev", `dn-ev--${a.status}`],
          extendedProps: { appointment: a },
        })),
    [appointments, showCancelled],
  );

  const { slotMinTime, slotMaxTime } = useMemo(() => visibleRange(hours.data, appointments), [hours.data, appointments]);
  const businessHours = useMemo(() => toBusinessHours(hours.data), [hours.data]);

  const onEventClick = useCallback((info: EventClickArg) => {
    info.jsEvent.preventDefault();
    setSelected(info.event.extendedProps.appointment as Appointment);
  }, []);

  const onDateClick = useCallback((arg: DateClickArg) => {
    // With a named time zone, dateStr is the wall time in Asia/Jerusalem ("2026-10-22T10:30:00+03:00").
    const date = arg.dateStr.slice(0, 10);
    const time = arg.dateStr.length > 10 ? arg.dateStr.slice(11, 16) : undefined;
    setPrefill({ date, time });
    setFormOpen(true);
  }, []);

  function openCreate() {
    setPrefill(null);
    setFormOpen(true);
  }

  function changeView(type: string) {
    calendarRef.current?.getApi().changeView(type);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t(`${K}.calendar.title`)}</h1>
        <Button size="lg" onClick={openCreate} className="max-sm:h-12 max-sm:px-5 max-sm:text-base">
          <Plus aria-hidden />
          {t(`${K}.newAppointment`)}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t(`${K}.calendar.viewsLabel`)} className="grid grid-cols-4 gap-1 rounded-full bg-secondary p-1 max-sm:w-full">
          {VIEWS.map((v) => (
            <button
              key={v.type}
              type="button"
              aria-pressed={viewType === v.type}
              onClick={() => changeView(v.type)}
              className={cn(
                "min-h-11 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                viewType === v.type ? "bg-ink text-ivory shadow-sm" : "text-foreground/80 hover:bg-white",
              )}
            >
              {t(v.label)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          {loading && <Spinner />}
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            {t(`${K}.calendar.showCancelled`)}
          </label>
        </div>
      </div>

      {!!error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-50 p-4 text-rose-900 ring-1 ring-rose-200">
          <p>{adminErrorMessage(error) === t("admin.errors.generic") ? t(`${K}.loadError`) : adminErrorMessage(error)}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw aria-hidden />
            {t(`${K}.retry`)}
          </Button>
        </div>
      )}

      <div className="dn-calendar">
        <FullCalendar
          ref={calendarRef}
          plugins={[luxon3Plugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          timeZone={BUSINESS_TIME_ZONE}
          locale={locale}
          direction="rtl"
          firstDay={0}
          initialView={isPhone ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={{ start: "title", center: "", end: "prev,today,next" }}
          height="auto"
          allDaySlot={false}
          nowIndicator
          navLinks
          eventInteractive
          stickyHeaderDates
          expandRows
          slotDuration="00:30:00"
          slotLabelInterval="01:00"
          slotLabelFormat={TIME_FORMAT}
          eventTimeFormat={TIME_FORMAT}
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
          scrollTime={slotMinTime}
          businessHours={businessHours}
          dayMaxEvents={3}
          events={events}
          eventContent={renderEvent}
          eventClick={onEventClick}
          dateClick={onDateClick}
          datesSet={onDatesSet}
        />
      </div>

      <AppointmentDetailsDialog appointment={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      <AppointmentFormDialog open={formOpen} onOpenChange={setFormOpen} prefill={prefill} onSaved={refresh} />
    </div>
  );
}

function renderEvent(arg: EventContentArg) {
  const a = arg.event.extendedProps.appointment as Appointment;
  const name = a.customer_name ?? "—";
  if (arg.view.type.startsWith("list")) {
    return (
      <span className="dn-ev-main">
        <span className="font-semibold">{name}</span> · {a.service_name_ar}
        {a.status !== "confirmed" && <span className="text-muted-foreground"> ({t(`${K}.status.${a.status}`)})</span>}
      </span>
    );
  }
  if (arg.view.type === "dayGridMonth") {
    return (
      <div className="dn-ev-body dn-ev-main truncate">
        <span className="ltr inline-block font-semibold">{arg.timeText}</span> {name}
      </div>
    );
  }
  return (
    <div className="dn-ev-body">
      <div className="ltr text-end text-[0.75rem] opacity-90">{arg.timeText}</div>
      <div className="dn-ev-main truncate font-semibold">{name}</div>
      <div className="truncate opacity-85">{a.service_name_ar}</div>
    </div>
  );
}
