import { Check, Clock } from "lucide-react";
import { Checkbox } from "@/components/ui/input";
import { t } from "@/i18n";
import { formatDurationAr, formatShekels } from "@/lib/format";
import { placeholders } from "@/lib/placeholders";
import { publicImageUrl } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Service } from "@/types/models";
import { useBooking } from "../BookingContext";

export function ServiceStep({ services }: { services: Service[] }) {
  const { state, dispatch } = useBooking();
  const selected = services.find((s) => s.id === state.serviceId);

  if (!services.length) return <p className="py-10 text-center text-muted-foreground">{t("booking.service.empty")}</p>;

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-3xl">{t("booking.service.title")}</h2>
      <div className="grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label={t("booking.service.title")}>
        {services.map((s) => {
          const isSelected = s.id === state.serviceId;
          return (
            <div key={s.id}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                data-testid={`service-${s.slug}`}
                onClick={() => dispatch({ type: "selectService", serviceId: s.id })}
                className={cn(
                  "group flex h-full w-full flex-col overflow-hidden rounded-3xl border bg-card text-start transition-all hover:shadow-md",
                  isSelected ? "border-primary bg-rose-light ring-2 ring-primary" : "border-border",
                )}
              >
                <img
                  src={publicImageUrl("service-images", s.image_path) ?? placeholders.service[s.category]}
                  alt=""
                  loading="lazy"
                  width={800}
                  height={600}
                  className="aspect-[16/9] w-full object-cover"
                />
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold leading-snug">{s.name_ar}</p>
                      <p className="ltr font-display text-base text-muted-foreground" lang="en">
                        {s.name_en}
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-semibold">{formatShekels(s.price_agorot)}</p>
                  </div>
                  {s.description_ar && <p className="text-sm leading-relaxed text-muted-foreground">{s.description_ar}</p>}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="size-4" aria-hidden /> {formatDurationAr(s.duration_minutes)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium",
                        isSelected ? "bg-primary text-primary-foreground" : "bg-secondary",
                      )}
                    >
                      {isSelected && <Check className="size-4" aria-hidden />}
                      {isSelected ? t("booking.service.selected") : t("booking.service.select")}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {selected && selected.service_addons.length > 0 && (
        <fieldset className="rounded-3xl border bg-card p-5">
          <legend className="px-2 text-base font-semibold">{t("booking.service.addons")}</legend>
          <div className="space-y-2">
            {selected.service_addons.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl p-3 hover:bg-secondary/60">
                <span className="flex items-center gap-3">
                  <Checkbox
                    checked={state.addonIds.includes(a.id)}
                    onChange={() => dispatch({ type: "toggleAddon", addonId: a.id })}
                    data-testid={`addon-${a.slug}`}
                  />
                  <span>
                    <span className="block font-medium">{a.name_ar}</span>
                    <span className="ltr block font-display text-sm text-muted-foreground" lang="en">
                      {a.name_en}
                    </span>
                  </span>
                </span>
                <span className="text-end text-sm">
                  <span className="block font-semibold">+{formatShekels(a.price_agorot)}</span>
                  <span className="block text-muted-foreground">
                    {a.extra_duration_minutes ? t("booking.service.extraTime", { minutes: a.extra_duration_minutes }) : t("booking.service.noExtraTime")}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {selected && selected.service_locations.length > 0 && (
        <fieldset className="rounded-3xl border bg-card p-5">
          <legend className="px-2 text-base font-semibold">{t("booking.service.location")}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("booking.service.location")}>
            {selected.service_locations.map((l) => {
              const active = state.locationId === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-testid={`location-${l.code}`}
                  onClick={() => dispatch({ type: "setLocation", locationId: l.id })}
                  className={cn(
                    "h-12 min-w-24 rounded-full border px-5 font-medium transition-colors",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-white hover:bg-secondary",
                  )}
                >
                  {l.name_ar}
                  <span className="ltr ms-1.5 font-display text-sm opacity-70" lang="en">
                    {l.name_en}
                  </span>
                  {l.price_delta_agorot !== 0 && <span className="ms-1 text-sm">(+{formatShekels(l.price_delta_agorot)})</span>}
                </button>
              );
            })}
          </div>
          {selected.location_required && !state.locationId && (
            <p className="mt-3 text-sm text-muted-foreground">{t("booking.service.locationRequired")}</p>
          )}
        </fieldset>
      )}
    </div>
  );
}
