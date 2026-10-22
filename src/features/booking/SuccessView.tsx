import { Link } from "react-router-dom";
import { CalendarCheck, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { formatDateAr, formatDurationAr, formatShekels, formatTime } from "@/lib/format";
import type { BookingResponse } from "@/types/models";

function manageUrl(token: string) {
  return `${window.location.origin}/a#${token}`;
}

export function SuccessView({ result, onBookAnother }: { result: BookingResponse; onBookAnother: () => void }) {
  const a = result.appointment;
  const start = new Date(a.startsAt);
  const link = manageUrl(result.manageToken);

  return (
    <div className="mx-auto max-w-lg animate-fade-up text-center" data-testid="booking-success">
      <span className="mx-auto grid size-20 place-items-center rounded-full bg-ink text-champagne">
        <CalendarCheck className="size-9" aria-hidden />
      </span>
      <h2 className="mt-6 text-3xl font-semibold">{t("booking.success.title")}</h2>
      <p className="mt-2 text-muted-foreground">{t("booking.success.text")}</p>

      <dl className="mt-8 divide-y rounded-3xl border bg-card text-start">
        <Row label={t("booking.success.reference")} value={<span className="ltr font-mono" data-testid="booking-reference">{a.reference}</span>} />
        <Row label={t("booking.review.service")} value={a.locationNameAr ? `${a.serviceNameAr} · ${a.locationNameAr}` : a.serviceNameAr} />
        <Row label={t("booking.review.date")} value={formatDateAr(start)} />
        <Row label={t("booking.review.time")} value={<span className="ltr">{formatTime(start)}</span>} />
        <Row label={t("booking.review.duration")} value={formatDurationAr(a.durationMinutes)} />
        <Row label={t("booking.review.total")} value={formatShekels(a.totalPriceAgorot)} />
      </dl>

      <div className="mt-6 rounded-3xl bg-cream p-5 text-start">
        <p className="font-semibold">{t("booking.success.manage")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("booking.success.manageHint")}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1">
            <a href={link} data-testid="manage-link">
              {t("booking.success.manage")}
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              navigator.clipboard?.writeText(link).then(
                () => toast.success(t("booking.success.copied")),
                () => undefined,
              )
            }
          >
            <Copy aria-hidden /> {t("booking.success.copy")}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button variant="ghost" asChild>
          <Link to="/">{t("booking.success.home")}</Link>
        </Button>
        <Button variant="ghost" onClick={onBookAnother}>
          {t("booking.success.bookAnother")}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}
