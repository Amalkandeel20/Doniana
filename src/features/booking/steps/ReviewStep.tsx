import { useCallback, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { t } from "@/i18n";
import { ApiError, callFunction, newIdempotencyKey } from "@/lib/api";
import { formatDateAr, formatDurationAr, formatPhoneForDisplay, formatShekels, formatTime, normalizeIsraeliMobile } from "@/lib/format";
import type { BookingResponse, Service } from "@/types/models";
import { quote } from "@shared/domain/pricing.ts";
import { useBooking } from "../BookingContext";
import { submissionSignature, type Step } from "../bookingState";
import { Turnstile } from "../Turnstile";
import { config } from "@/lib/config";

export function ReviewStep({ service, onBooked }: { service: Service; onBooked: (result: BookingResponse) => void }) {
  const { state, dispatch } = useBooking();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const onToken = useCallback((token: string | null) => setChallenge(token), []);

  const addons = service.service_addons.filter((a) => state.addonIds.includes(a.id));
  const location = service.service_locations.find((l) => l.id === state.locationId) ?? null;
  const q = quote(
    { priceAgorot: service.price_agorot, durationMinutes: service.duration_minutes },
    addons.map((a) => ({ priceAgorot: a.price_agorot, extraDurationMinutes: a.extra_duration_minutes })),
    location ? { priceDeltaAgorot: location.price_delta_agorot, durationDeltaMinutes: location.duration_delta_minutes } : null,
  );
  const start = new Date(state.slot!.startsAt);
  const phone = normalizeIsraeliMobile(state.customerPhone) ?? state.customerPhone;

  async function confirm() {
    if (inFlight.current) return; // ignore double taps; the idempotency key covers retries too
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    const signature = submissionSignature(state, phone);
    const key = state.submission?.signature === signature ? state.submission.key : newIdempotencyKey();
    if (state.submission?.key !== key) dispatch({ type: "bindSubmission", key, signature });
    try {
      const result = await callFunction<BookingResponse>("create-booking", {
        idempotencyKey: key,
        serviceId: state.serviceId,
        addonIds: state.addonIds,
        locationId: state.locationId,
        startsAt: state.slot!.startsAt,
        customerName: state.customerName,
        customerPhone: state.customerPhone,
        website: honeypot.current?.value ?? "",
        ...(challenge ? { turnstileToken: challenge } : {}),
      });
      onBooked(result);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "generic";
      const message = t(`booking.errors.${code}`) === `booking.errors.${code}` ? t("booking.errors.generic") : t(`booking.errors.${code}`);
      if (code === "slot_unavailable") {
        toast.error(message);
        dispatch({ type: "slotTaken" });
      } else {
        setError(message);
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const rows: { label: string; value: React.ReactNode; step: Step; testId?: string }[] = [
    { label: t("booking.review.category"), value: t(`categories.${service.category}.ar`), step: 1 },
    {
      label: t("booking.review.service"),
      value: (
        <>
          {service.name_ar}
          <span className="ltr block font-display text-sm text-muted-foreground" lang="en">
            {service.name_en}
          </span>
        </>
      ),
      step: 1,
    },
    ...(addons.length ? [{ label: t("booking.review.addons"), value: addons.map((a) => `${a.name_ar} (+${formatShekels(a.price_agorot)})`).join("، "), step: 1 as Step }] : []),
    ...(location ? [{ label: t("booking.review.location"), value: location.name_ar, step: 1 as Step }] : []),
    { label: t("booking.review.date"), value: formatDateAr(start), step: 2 },
    { label: t("booking.review.time"), value: <span className="ltr">{formatTime(start)}</span>, step: 2 },
    { label: t("booking.review.duration"), value: formatDurationAr(q.durationMinutes), step: 1 },
    { label: t("booking.review.name"), value: state.customerName, step: 3 },
    { label: t("booking.review.phone"), value: formatPhoneForDisplay(phone), step: 3 },
  ];

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-3xl">{t("booking.review.title")}</h2>
      <dl className="divide-y overflow-hidden rounded-3xl border bg-card" data-testid="review-summary">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4 px-5 py-3.5">
            <dt className="shrink-0 text-sm text-muted-foreground">{r.label}</dt>
            <dd className="flex items-start gap-2 text-end font-medium">
              <span>{r.value}</span>
              <button
                type="button"
                onClick={() => dispatch({ type: "goTo", step: r.step })}
                className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label={`${t("booking.review.edit")} ${r.label}`}
              >
                <Pencil className="size-3.5" aria-hidden />
              </button>
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between bg-primary px-5 py-4 text-primary-foreground">
          <dt className="font-medium">{t("booking.review.total")}</dt>
          <dd className="font-heading text-3xl" data-testid="review-total">
            {formatShekels(q.totalPriceAgorot)}
          </dd>
        </div>
      </dl>

      <p className="text-sm text-muted-foreground">{t("booking.review.policy")}</p>

      {/* Honeypot for bots: hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input ref={honeypot} name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <Turnstile onToken={onToken} />

      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 p-4 text-destructive">
          {error}
        </p>
      )}

      <Button
        size="lg"
        className="w-full"
        onClick={confirm}
        disabled={submitting || (!!config.turnstileSiteKey && !challenge)}
        data-testid="confirm-booking"
      >
        {submitting ? <Spinner className="text-primary-foreground" label={t("booking.review.confirming")} /> : t("booking.review.confirm")}
      </Button>
    </div>
  );
}
