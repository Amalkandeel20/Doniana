import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Checkbox, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FieldError, Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { ApiError } from "@/lib/api";
import { formatDurationAr, formatShekels, normalizeIsraeliMobile } from "@/lib/format";
import type { Appointment, Service, ServiceCategory } from "@/types/models";
import { quote } from "@shared/domain/pricing.ts";
import { customerNameSchema, customerPhoneSchema } from "@shared/domain/schemas.ts";
import { isValidLocalDate } from "@shared/domain/time.ts";
import { adminErrorMessage } from "../adminApi";
import {
  createAppointment,
  fetchCatalog,
  localDateTimeToIso,
  toLocalDateTime,
  todayLocalDate,
  updateAppointment,
  type AppointmentInput,
} from "../appointmentsData";

const K = "admin.appointments.form";

const formSchema = z.object({
  serviceId: z.string().min(1, `${K}.errors.serviceRequired`),
  addonIds: z.array(z.string()),
  locationId: z.string(),
  date: z.string().refine(isValidLocalDate, `${K}.errors.dateRequired`),
  time: z.string().regex(/^\d{2}:\d{2}$/, `${K}.errors.timeRequired`),
  customerName: customerNameSchema,
  customerPhone: customerPhoneSchema,
  notes: z.string().max(1000, `${K}.errors.notesLong`),
  allowOutsideHours: z.boolean(),
  notifyCustomer: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

export interface AppointmentPrefill {
  date?: string;
  time?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode. */
  appointment?: Appointment | null;
  /** Create mode: date/time picked on the calendar. */
  prefill?: AppointmentPrefill | null;
  onSaved: (appointment: Appointment) => void;
}

export function AppointmentFormDialog({ open, onOpenChange, appointment, prefill, onSaved }: Props) {
  const editing = !!appointment;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide onInteractOutside={(e) => e.preventDefault()}>
        <DialogTitle>{t(editing ? `${K}.editTitle` : `${K}.createTitle`)}</DialogTitle>
        <DialogDescription>{t(editing ? `${K}.editText` : `${K}.createText`)}</DialogDescription>
        <FormBody
          appointment={appointment ?? null}
          prefill={prefill ?? null}
          onCancel={() => onOpenChange(false)}
          onSaved={(saved) => {
            onOpenChange(false);
            onSaved(saved);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function slotErrorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : (error as { message?: string } | null)?.message;
  const detail = error instanceof ApiError ? error.detail : (error as { details?: string } | null)?.details;
  if (code === "slot_unavailable") return t(detail === "conflict" ? `${K}.errors.slotConflict` : `${K}.errors.slotUnavailable`);
  if (code === "validation_failed") return t(`${K}.errors.validation`);
  return adminErrorMessage(error);
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function FormBody({
  appointment,
  prefill,
  onCancel,
  onSaved,
}: {
  appointment: Appointment | null;
  prefill: AppointmentPrefill | null;
  onCancel: () => void;
  onSaved: (appointment: Appointment) => void;
}) {
  const catalog = useAsync(fetchCatalog, []);
  const services = useMemo(() => catalog.data ?? [], [catalog.data]);
  const [serverError, setServerError] = useState<string | null>(null);

  const originalAddonIds = useMemo(
    () => (appointment?.appointment_addons ?? []).map((a) => a.addon_id).filter((id): id is string => !!id),
    [appointment],
  );

  const defaultValues = useMemo<FormValues>(() => {
    if (appointment) {
      const local = toLocalDateTime(appointment.starts_at);
      return {
        serviceId: appointment.service_id,
        addonIds: originalAddonIds,
        locationId: appointment.location_id ?? "",
        date: local.date,
        time: local.time,
        customerName: appointment.customer_name ?? "",
        customerPhone: appointment.customer_phone ? toLocalPhone(appointment.customer_phone) : "",
        notes: appointment.notes ?? "",
        allowOutsideHours: false,
        notifyCustomer: true,
      };
    }
    return {
      serviceId: "",
      addonIds: [],
      locationId: "",
      date: prefill?.date ?? todayLocalDate(),
      time: prefill?.time ?? "",
      customerName: "",
      customerPhone: "",
      notes: "",
      allowOutsideHours: false,
      notifyCustomer: true,
    };
  }, [appointment, prefill, originalAddonIds]);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues, mode: "onTouched" });

  const serviceId = watch("serviceId");
  const addonIds = watch("addonIds");
  const locationId = watch("locationId");
  const date = watch("date");
  const time = watch("time");
  const service = services.find((s) => s.id === serviceId);

  // Inactive add-ons/locations stay visible only when this appointment already uses them.
  const addons = (service?.service_addons ?? []).filter((a) => a.is_active || addonIds.includes(a.id));
  const locations = (service?.service_locations ?? []).filter((l) => l.is_active || l.id === locationId);

  const catalogUnchanged =
    !!appointment &&
    serviceId === appointment.service_id &&
    (locationId || null) === appointment.location_id &&
    sameIds(addonIds, originalAddonIds);

  const totals = useMemo(() => {
    if (catalogUnchanged && appointment) {
      return { totalPriceAgorot: appointment.total_price_agorot, durationMinutes: appointment.duration_minutes };
    }
    if (!service) return null;
    const location = service.service_locations.find((l) => l.id === locationId);
    try {
      return quote(
        { priceAgorot: service.price_agorot, durationMinutes: service.duration_minutes },
        service.service_addons
          .filter((a) => addonIds.includes(a.id))
          .map((a) => ({ priceAgorot: a.price_agorot, extraDurationMinutes: a.extra_duration_minutes })),
        location ? { priceDeltaAgorot: location.price_delta_agorot, durationDeltaMinutes: location.duration_delta_minutes } : null,
      );
    } catch {
      return null;
    }
  }, [catalogUnchanged, appointment, service, addonIds, locationId]);

  const startsAtPreview = isValidLocalDate(date) && /^\d{2}:\d{2}$/.test(time) ? localDateTimeToIso(date, time) : null;
  const inPast = !!startsAtPreview && new Date(startsAtPreview).getTime() < Date.now();

  const grouped = useMemo(() => {
    const groups = new Map<ServiceCategory, Service[]>();
    for (const s of services) {
      if (!s.is_active && s.id !== appointment?.service_id) continue;
      groups.set(s.category, [...(groups.get(s.category) ?? []), s]);
    }
    return [...groups.entries()];
  }, [services, appointment]);

  const serviceField = register("serviceId");

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const selected = services.find((s) => s.id === values.serviceId);
    if (selected?.location_required && !values.locationId) {
      setError("locationId", { message: `${K}.errors.locationRequired` }, { shouldFocus: true });
      return;
    }
    const startsAt = localDateTimeToIso(values.date, values.time);
    if (!startsAt) {
      setError("time", { message: `${K}.errors.timeInvalid` }, { shouldFocus: true });
      return;
    }
    const input: AppointmentInput = {
      serviceId: values.serviceId,
      addonIds: values.addonIds,
      locationId: values.locationId || null,
      startsAt,
      customerName: values.customerName.trim(),
      customerPhone: normalizeIsraeliMobile(values.customerPhone) ?? values.customerPhone,
      notes: values.notes.trim(),
      allowOutsideHours: values.allowOutsideHours,
      notifyCustomer: values.notifyCustomer,
    };
    try {
      const saved = appointment ? await updateAppointment(appointment.id, input) : await createAppointment(input);
      toast.success(t(appointment ? "admin.appointments.toasts.updated" : "admin.appointments.toasts.created"));
      onSaved(saved);
    } catch (error) {
      setServerError(slotErrorMessage(error));
    }
  });

  const msg = (key?: string) => (key ? t(key) : undefined);
  const describe = (name: string, hasError: boolean, hint?: boolean) =>
    hasError ? `${name}-error` : hint ? `${name}-hint` : undefined;

  if (catalog.loading && !catalog.data) return <Spinner className="mt-6" />;
  if (catalog.error) {
    return (
      <div className="mt-6 space-y-3">
        <p role="alert" className="text-destructive">
          {t(`${K}.catalogError`)}
        </p>
        <Button variant="outline" onClick={catalog.reload}>
          {t("admin.appointments.retry")}
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="mt-5 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="appt-service">{t(`${K}.service`)}</Label>
        <NativeSelect
          id="appt-service"
          aria-invalid={!!errors.serviceId}
          aria-describedby={describe("appt-service", !!errors.serviceId)}
          {...serviceField}
          onChange={(e) => {
            void serviceField.onChange(e);
            setValue("addonIds", []);
            setValue("locationId", "");
          }}
        >
          <option value="">{t(`${K}.servicePlaceholder`)}</option>
          {grouped.map(([category, list]) => (
            <optgroup key={category} label={t(`categories.${category}.ar`)}>
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_ar} — {formatShekels(s.price_agorot)}
                  {s.is_active ? "" : ` ${t(`${K}.inactive`)}`}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
        <FieldError id="appt-service-error" message={msg(errors.serviceId?.message)} />
      </div>

      {locations.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="appt-location">{t(`${K}.location`)}</Label>
          <NativeSelect
            id="appt-location"
            aria-invalid={!!errors.locationId}
            aria-describedby={describe("appt-location", !!errors.locationId)}
            {...register("locationId")}
          >
            <option value="">{t(`${K}.locationPlaceholder`)}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name_ar}
                {l.price_delta_agorot ? ` (+${formatShekels(l.price_delta_agorot)})` : ""}
                {l.is_active ? "" : ` ${t(`${K}.inactive`)}`}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="appt-location-error" message={msg(errors.locationId?.message)} />
        </div>
      )}

      {addons.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{t(`${K}.addons`)}</legend>
          {addons.map((a) => (
            <label key={a.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2">
              <Checkbox
                checked={addonIds.includes(a.id)}
                onChange={(e) =>
                  setValue(
                    "addonIds",
                    e.target.checked ? [...addonIds, a.id] : addonIds.filter((id) => id !== a.id),
                    { shouldDirty: true },
                  )
                }
              />
              <span className="flex-1">
                {a.name_ar}
                {a.is_active ? "" : ` ${t(`${K}.inactive`)}`}
              </span>
              <span className="text-sm text-muted-foreground">+{formatShekels(a.price_agorot)}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="appt-date">{t(`${K}.date`)}</Label>
          <Input
            id="appt-date"
            type="date"
            dir="ltr"
            aria-invalid={!!errors.date}
            aria-describedby={describe("appt-date", !!errors.date)}
            {...register("date")}
          />
          <FieldError id="appt-date-error" message={msg(errors.date?.message)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="appt-time">{t(`${K}.time`)}</Label>
          <Input
            id="appt-time"
            type="time"
            step={300}
            dir="ltr"
            aria-invalid={!!errors.time}
            aria-describedby={describe("appt-time", !!errors.time)}
            {...register("time")}
          />
          <FieldError id="appt-time-error" message={msg(errors.time?.message)} />
        </div>
      </div>
      {inPast && <p className="text-sm text-amber-800">{t(`${K}.pastWarning`)}</p>}

      <div className="space-y-2">
        <Label htmlFor="appt-name">{t(`${K}.customerName`)}</Label>
        <Input
          id="appt-name"
          autoComplete="off"
          aria-invalid={!!errors.customerName}
          aria-describedby={describe("appt-name", !!errors.customerName)}
          {...register("customerName")}
        />
        <FieldError id="appt-name-error" message={msg(errors.customerName?.message)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="appt-phone">{t(`${K}.customerPhone`)}</Label>
        <Input
          id="appt-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          dir="ltr"
          placeholder={t(`${K}.phonePlaceholder`)}
          className="text-end placeholder:text-end"
          aria-invalid={!!errors.customerPhone}
          aria-describedby={describe("appt-phone", !!errors.customerPhone)}
          {...register("customerPhone")}
        />
        <FieldError id="appt-phone-error" message={msg(errors.customerPhone?.message)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="appt-notes">{t(`${K}.notes`)}</Label>
        <Textarea
          id="appt-notes"
          rows={3}
          maxLength={1000}
          placeholder={t(`${K}.notesPlaceholder`)}
          aria-invalid={!!errors.notes}
          aria-describedby={describe("appt-notes", !!errors.notes)}
          {...register("notes")}
        />
        <FieldError id="appt-notes-error" message={msg(errors.notes?.message)} />
      </div>

      <div className="space-y-3 rounded-2xl bg-secondary/60 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox className="mt-0.5" aria-describedby="appt-override-hint" {...register("allowOutsideHours")} />
          <span>
            <span className="block font-medium">{t(`${K}.allowOutsideHours`)}</span>
            <span id="appt-override-hint" className="block text-sm text-muted-foreground">
              {t(`${K}.allowOutsideHoursHint`)}
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox className="mt-0.5" {...register("notifyCustomer")} />
          <span className="font-medium">{t(appointment ? `${K}.notifyEdit` : `${K}.notifyCreate`)}</span>
        </label>
      </div>

      {totals && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 rounded-2xl border px-4 py-3">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t(`${K}.total`)}:</dt>
            <dd className="font-semibold">{formatShekels(totals.totalPriceAgorot)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t(`${K}.duration`)}:</dt>
            <dd className="font-semibold">{formatDurationAr(totals.durationMinutes)}</dd>
          </div>
        </dl>
      )}

      {serverError && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-rose-50 p-4 text-rose-900 ring-1 ring-rose-200">
          <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{serverError}</p>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          {t(`${K}.cancel`)}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t(`${K}.saving`) : t(appointment ? `${K}.save` : `${K}.create`)}
        </Button>
      </div>
    </form>
  );
}

/** +972541234567 → 054-1234567 so the owner edits the number in the familiar local form. */
function toLocalPhone(e164: string): string {
  const m = /^\+972(5\d)(\d{7})$/.exec(e164);
  return m ? `0${m[1]}-${m[2]}` : e164;
}
