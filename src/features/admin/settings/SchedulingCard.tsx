import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { toastSaved } from "../adminApi";
import { Field, LoadState, Section } from "./common";
import { fieldAria, humanizeMinutes, must, toastDbError, vInt } from "./data";

const K = "admin.settings.availability.scheduling";

const schema = z.object({
  slot_interval_minutes: vInt(5, 120),
  buffer_minutes: vInt(0, 120),
  min_notice_minutes: vInt(0, 10080),
  booking_horizon_days: vInt(1, 365),
});
type Values = z.infer<typeof schema>;

const fetchScheduling = async () =>
  must<Values>(
    await supabase
      .from("business_settings")
      .select("slot_interval_minutes, buffer_minutes, min_notice_minutes, booking_horizon_days")
      .eq("id", true)
      .single(),
  );

export function SchedulingCard() {
  const { data, loading, error, reload } = useAsync(fetchScheduling, []);
  return (
    <Section title={t(`${K}.title`)} text={t(`${K}.text`)}>
      {data ? <SchedulingForm initial={data} /> : <LoadState loading={loading} error={error} onRetry={reload} />}
    </Section>
  );
}

function SchedulingForm({ initial }: { initial: Values }) {
  const { register, handleSubmit, reset, control, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const values = useWatch({ control });
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    try {
      must(await supabase.from("business_settings").update(v).eq("id", true));
      toastSaved();
      reset(v);
    } catch (e) {
      toastDbError(e);
    }
  });

  const preview = (minutes: number | undefined, zeroText?: string) =>
    typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 0
      ? minutes === 0 && zeroText
        ? zeroText
        : t(`${K}.equals`, { value: humanizeMinutes(minutes) })
      : null;

  const numberField = (name: keyof Values, label: string, help: string, extra: string | null) => {
    const id = `sched-${name}`;
    const message = errors[name]?.message;
    return (
      <Field id={id} label={label} help={help} error={message}>
        <div className="flex items-center gap-3">
          <Input type="number" inputMode="numeric" dir="ltr" className="max-w-32" {...fieldAria(id, message, true)} {...register(name, { valueAsNumber: true })} />
          {extra && <span className="text-sm font-medium">{extra}</span>}
        </div>
      </Field>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        {numberField("slot_interval_minutes", t(`${K}.slotInterval`), t(`${K}.slotIntervalHelp`), null)}
        {numberField("buffer_minutes", t(`${K}.buffer`), t(`${K}.bufferHelp`), preview(values.buffer_minutes))}
        {numberField("min_notice_minutes", t(`${K}.minNotice`), t(`${K}.minNoticeHelp`), preview(values.min_notice_minutes, t(`${K}.sameDay`)))}
        {numberField("booking_horizon_days", t(`${K}.horizon`), t(`${K}.horizonHelp`), null)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={formState.isSubmitting} className="w-full sm:w-auto">
          {formState.isSubmitting ? t("admin.settings.common.saving") : t("admin.settings.common.save")}
        </Button>
        {formState.isDirty && <span className="text-sm text-amber-800">{t("admin.settings.common.unsaved")}</span>}
      </div>
    </form>
  );
}
