import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Phone, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { t } from "@/i18n";
import { formatDateAr, formatDurationAr, formatPhoneForDisplay, formatShekels, formatTime, whatsappLink } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/models";
import { adminErrorMessage } from "../adminApi";
import { fetchAppointmentsPage, type AppointmentsTab } from "../appointmentsData";
import { AppointmentDetailsDialog, StatusBadge } from "../components/AppointmentDetailsDialog";
import { AppointmentFormDialog } from "../components/AppointmentFormDialog";

const K = "admin.appointments";
const TABS: AppointmentsTab[] = ["upcoming", "past", "cancelled"];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export default function AppointmentsPage() {
  const [tab, setTab] = useState<AppointmentsTab>("upcoming");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim(), 300);
  const [rows, setRows] = useState<Appointment[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchAppointmentsPage({ tab, search: debouncedSearch, offset: 0 })
      .then((page) => {
        if (!active) return;
        setRows(page.rows);
        setHasMore(page.hasMore);
      })
      .catch((e: unknown) => active && setError(e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [tab, debouncedSearch, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await fetchAppointmentsPage({ tab, search: debouncedSearch, offset: rows.length });
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(page.hasMore);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  }

  const errorText = error ? (adminErrorMessage(error) === t("admin.errors.generic") ? t(`${K}.loadError`) : adminErrorMessage(error)) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl">{t(`${K}.list.title`)}</h1>
        <Button size="lg" onClick={() => setFormOpen(true)} className="max-sm:h-12 max-sm:px-5 max-sm:text-base">
          <Plus aria-hidden />
          {t(`${K}.newAppointment`)}
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="appt-search" className="sr-only">
          {t(`${K}.list.search`)}
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="appt-search"
            type="search"
            inputMode="search"
            autoComplete="off"
            enterKeyHint="search"
            className="ps-12"
            placeholder={t(`${K}.list.searchPlaceholder`)}
            aria-label={t(`${K}.list.search`)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div role="group" aria-label={t(`${K}.list.tabsLabel`)} className="grid grid-cols-3 gap-1 rounded-full bg-secondary p-1 sm:inline-grid">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "min-h-11 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === key ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/80 hover:bg-white",
            )}
          >
            {t(`${K}.list.tabs.${key}`)}
          </button>
        ))}
      </div>

      {errorText && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-50 p-4 text-rose-900 ring-1 ring-rose-200">
          <p>{errorText}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw aria-hidden />
            {t(`${K}.retry`)}
          </Button>
        </div>
      )}

      {loading ? (
        <Spinner className="mt-6" label={t(`${K}.loading`)} />
      ) : rows.length === 0 && !error ? (
        <p className="rounded-3xl border border-dashed p-8 text-center text-muted-foreground">
          {t(debouncedSearch ? `${K}.list.empty.search` : `${K}.list.empty.${tab}`)}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={a.id}>
              <AppointmentCard appointment={a} onOpen={() => setSelected(a)} />
            </li>
          ))}
        </ul>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Spinner /> : t(`${K}.list.loadMore`)}
          </Button>
        </div>
      )}

      <AppointmentDetailsDialog appointment={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      <AppointmentFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={refresh} />
    </div>
  );
}

function AppointmentCard({ appointment: a, onOpen }: { appointment: Appointment; onOpen: () => void }) {
  const starts = new Date(a.starts_at);
  const name = a.customer_name ?? t(`${K}.details.anonymized`);
  const extras = [a.location_name_ar, ...(a.appointment_addons ?? []).map((x) => x.name_ar)].filter(Boolean).join("، ");

  return (
    <Card className={cn("overflow-hidden", a.status === "cancelled" && "opacity-80")}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t(`${K}.list.openDetails`, { name })}
        className="block w-full p-4 text-start transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {formatDateAr(starts)} · <span className="ltr inline-block font-semibold text-foreground">{formatTime(starts)}</span>
          </div>
          <StatusBadge status={a.status} />
        </div>
        <p className={cn("mt-1.5 text-lg font-semibold", a.status === "cancelled" && "line-through decoration-rose-400")}>{name}</p>
        <p className="text-[0.95rem]">
          {a.service_name_ar}
          {extras && <span className="text-muted-foreground"> — {extras}</span>}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
          <span>{formatDurationAr(a.duration_minutes)}</span>
          <span className="font-medium text-foreground">{formatShekels(a.total_price_agorot)}</span>
          <span>{t(`${K}.source.${a.source}`)}</span>
        </p>
      </button>
      {a.customer_phone && (
        <div className="grid grid-cols-2 border-t">
          <a
            href={`tel:${a.customer_phone}`}
            className="flex min-h-12 items-center justify-center gap-2 text-sm font-medium hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label={`${t(`${K}.list.call`)} ${name}`}
          >
            <Phone className="size-4" aria-hidden />
            <span className="ltr">{formatPhoneForDisplay(a.customer_phone)}</span>
          </a>
          <a
            href={whatsappLink(a.customer_phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 border-s text-sm font-medium hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <MessageCircle className="size-4" aria-hidden />
            {t(`${K}.list.whatsapp`)}
          </a>
        </div>
      )}
    </Card>
  );
}
