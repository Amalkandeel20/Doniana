import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarX2, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { fetchBusinessInfo } from "@/features/services/publicData";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { ApiError, callFunction } from "@/lib/api";
import { formatDateAr, formatDurationAr, formatShekels, formatTime, whatsappLink } from "@/lib/format";
import type { PublicAppointment } from "@/types/models";

/** The token lives in the URL fragment (#…), which browsers never send to servers or in Referer. */
function readToken(): string {
  return window.location.hash.replace(/^#/, "").trim();
}

export default function ManageAppointmentPage() {
  const [token] = useState(readToken);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [appointment, setAppointment] = useState<PublicAppointment | null>(null);
  const info = useAsync(() => fetchBusinessInfo(), []);

  useEffect(() => {
    // Belt and braces: never leak the page URL to anything this page might load.
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const view = useAsync(
    () => (token ? callFunction<{ appointment: PublicAppointment }>("manage-appointment", { token, action: "view" }) : Promise.reject(new ApiError("not_found", 404))),
    [token],
  );
  const current = appointment ?? view.data?.appointment ?? null;

  async function cancel() {
    setCancelling(true);
    try {
      const res = await callFunction<{ appointment: PublicAppointment }>("manage-appointment", { token, action: "cancel" });
      setAppointment(res.appointment);
      setConfirmOpen(false);
      toast.success(t("manage.cancelled"));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "generic";
      const key = `manage.errors.${code}`;
      toast.error(t(key) === key ? t("booking.errors.generic") : t(key));
      setConfirmOpen(false);
      view.reload();
    } finally {
      setCancelling(false);
    }
  }

  const settings = info.data?.settings;
  const contact = (
    <div className="flex flex-col gap-2 sm:flex-row">
      {settings?.whatsapp_phone && (
        <Button variant="outline" asChild>
          <a href={whatsappLink(settings.whatsapp_phone)} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden /> {t("home.whatsapp")}
          </a>
        </Button>
      )}
      {settings?.contact_phone && (
        <Button variant="outline" asChild>
          <a href={`tel:${settings.contact_phone}`}>
            <Phone aria-hidden /> {t("home.call")}
          </a>
        </Button>
      )}
    </div>
  );

  return (
    <section className="container max-w-xl py-10 sm:py-16">
      <h1 className="text-center font-heading text-4xl">{t("manage.title")}</h1>

      {view.loading && !current && <Spinner label={t("manage.loading")} className="mt-10 flex justify-center" />}

      {!view.loading && !current && (
        <div className="mt-10 rounded-3xl bg-secondary p-6 text-center" role="alert" data-testid="manage-not-found">
          <CalendarX2 className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <p className="mt-3">{t("manage.notFound")}</p>
          <Button asChild className="mt-5">
            <Link to="/book">{t("manage.bookNew")}</Link>
          </Button>
        </div>
      )}

      {current && (
        <div className="mt-8 space-y-6" data-testid="manage-view">
          <dl className="divide-y rounded-3xl border bg-card">
            <div className="flex items-center justify-between px-5 py-4">
              <dt className="text-sm text-muted-foreground">{t("manage.statusLabel")}</dt>
              <dd>
                <Badge variant={current.status} data-testid="manage-status">
                  {t(`manage.status.${current.status}`)}
                </Badge>
              </dd>
            </div>
            <Row label={t("booking.review.service")} value={current.locationNameAr ? `${current.serviceNameAr} · ${current.locationNameAr}` : current.serviceNameAr} />
            {current.addons.length > 0 && <Row label={t("booking.review.addons")} value={current.addons.map((a) => a.nameAr).join("، ")} />}
            <Row label={t("booking.review.date")} value={formatDateAr(new Date(current.startsAt))} />
            <Row label={t("booking.review.time")} value={<span className="ltr">{formatTime(new Date(current.startsAt))}</span>} />
            <Row label={t("booking.review.duration")} value={formatDurationAr(current.durationMinutes)} />
            <Row label={t("manage.price")} value={formatShekels(current.totalPriceAgorot)} />
            {current.customerName && <Row label={t("booking.review.name")} value={current.customerName} />}
            <Row label={t("booking.success.reference")} value={<span className="ltr font-mono">{current.reference}</span>} />
          </dl>

          {current.status === "confirmed" && current.canCancel && (
            <div className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                {t("manage.cancelUntil", {
                  date: formatDateAr(new Date(current.cancellationDeadline)),
                  time: formatTime(new Date(current.cancellationDeadline)),
                })}
              </p>
              <Button variant="outline" className="w-full border-destructive/40 text-destructive hover:bg-destructive/5" onClick={() => setConfirmOpen(true)} data-testid="cancel-appointment">
                {t("manage.cancel")}
              </Button>
            </div>
          )}

          {current.status === "confirmed" && !current.canCancel && (
            <div className="space-y-4 rounded-3xl bg-cream p-5">
              <Button variant="outline" className="w-full" disabled aria-describedby="cutoff-msg" data-testid="cancel-appointment">
                {t("manage.cancel")}
              </Button>
              <p id="cutoff-msg" className="text-sm leading-relaxed" data-testid="cutoff-message">
                {t("manage.cutoff")}
              </p>
              {contact}
            </div>
          )}

          {current.status === "cancelled" && (
            <div className="space-y-4 rounded-3xl bg-secondary p-5 text-center">
              <p>{current.cancelledBy === "admin" ? t("manage.cancelledByOwner") : t("manage.cancelled")}</p>
              <Button asChild>
                <Link to="/book">{t("manage.bookNew")}</Link>
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("manage.cancelConfirmTitle")}
        description={t("manage.cancelConfirmText")}
        confirmLabel={t("manage.cancelConfirm")}
        cancelLabel={t("manage.keep")}
        destructive
        busy={cancelling}
        onConfirm={cancel}
      />
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}
