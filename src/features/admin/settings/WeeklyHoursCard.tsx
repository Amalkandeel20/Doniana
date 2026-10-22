import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError, Label } from "@/components/ui/label";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { ARABIC_WEEKDAYS } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { BusinessHours } from "@/types/models";
import { toastSaved } from "../adminApi";
import { CheckboxRow, LoadState, Section } from "./common";
import { must, TIME_RE, toastDbError, toTimeInput } from "./data";

const schema = z.object({
  days: z
    .array(z.object({ weekday: z.number(), is_open: z.boolean(), open_time: z.string(), close_time: z.string() }))
    .superRefine((days, ctx) => {
      days.forEach((d, i) => {
        if (!d.is_open) return;
        if (!TIME_RE.test(d.open_time)) ctx.addIssue({ code: "custom", path: [i, "open_time"], message: t("admin.settings.v.time") });
        else if (!TIME_RE.test(d.close_time)) ctx.addIssue({ code: "custom", path: [i, "close_time"], message: t("admin.settings.v.time") });
        else if (d.open_time >= d.close_time)
          ctx.addIssue({ code: "custom", path: [i, "close_time"], message: t("admin.settings.v.timeOrder") });
      });
    }),
});
type Values = z.infer<typeof schema>;

async function fetchHours(): Promise<Values> {
  const rows = must<BusinessHours[]>(await supabase.from("business_hours").select("weekday, is_open, open_time, close_time").order("weekday"));
  return {
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
      const row = rows.find((r) => r.weekday === weekday);
      return {
        weekday,
        is_open: row?.is_open ?? false,
        open_time: toTimeInput(row?.open_time ?? "09:00"),
        close_time: toTimeInput(row?.close_time ?? "17:00"),
      };
    }),
  };
}

export function WeeklyHoursCard() {
  const { data, loading, error, reload } = useAsync(fetchHours, []);
  return (
    <Section title={t("admin.settings.availability.hours.title")} text={t("admin.settings.availability.hours.text")}>
      {data ? <HoursForm initial={data} /> : <LoadState loading={loading} error={error} onRetry={reload} />}
    </Section>
  );
}

function HoursForm({ initial }: { initial: Values }) {
  const { register, handleSubmit, control, reset, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const days = useWatch({ control, name: "days" });

  const onSubmit = handleSubmit(async (values) => {
    try {
      must(await supabase.from("business_hours").upsert(values.days, { onConflict: "weekday" }));
      toastSaved();
      reset(values);
    } catch (e) {
      toastDbError(e);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      {initial.days.map((day, i) => {
        const open = days[i]?.is_open ?? false;
        const errors = formState.errors.days?.[i];
        const name = ARABIC_WEEKDAYS[day.weekday]!;
        return (
          <fieldset key={day.weekday} className={cn("rounded-2xl border p-3 sm:p-4", open ? "bg-white" : "bg-secondary/40")}>
            <legend className="sr-only">{name}</legend>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center justify-between gap-3 sm:w-56">
                <span className="text-lg font-semibold">{name}</span>
                <CheckboxRow
                  id={`day-${day.weekday}-open`}
                  label={open ? t("admin.settings.availability.hours.open") : t("admin.settings.availability.hours.closed")}
                  className="border-0 bg-transparent px-2 py-2"
                  {...register(`days.${i}.is_open`)}
                />
              </div>
              {open && (
                <div className="grid flex-1 grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`day-${day.weekday}-from`}>{t("admin.settings.availability.hours.opens")}</Label>
                    <Input
                      id={`day-${day.weekday}-from`}
                      type="time"
                      step={300}
                      dir="ltr"
                      aria-invalid={!!errors?.open_time}
                      {...register(`days.${i}.open_time`)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`day-${day.weekday}-to`}>{t("admin.settings.availability.hours.closes")}</Label>
                    <Input
                      id={`day-${day.weekday}-to`}
                      type="time"
                      step={300}
                      dir="ltr"
                      aria-invalid={!!errors?.close_time}
                      {...register(`days.${i}.close_time`)}
                    />
                  </div>
                </div>
              )}
            </div>
            <FieldError message={errors?.open_time?.message ?? errors?.close_time?.message} />
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" disabled={formState.isSubmitting} className="w-full sm:w-auto">
          {formState.isSubmitting ? t("admin.settings.common.saving") : t("admin.settings.common.save")}
        </Button>
        {formState.isDirty && <span className="text-sm text-amber-800">{t("admin.settings.common.unsaved")}</span>}
      </div>
    </form>
  );
}
