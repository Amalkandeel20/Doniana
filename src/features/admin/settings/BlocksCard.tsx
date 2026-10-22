import { type ChangeEvent, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { formatDateAr, formatTime } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import {
  addDaysToLocalDate,
  isValidLocalDate,
  startOfLocalDayUtc,
  timeStringToMinutes,
  toZonedParts,
  zonedWallTimeToUtc,
} from "@shared/domain/time.ts";
import { toastSaved } from "../adminApi";
import { CheckboxRow, EmptyText, Field, LoadState, Section } from "./common";
import { BLOCK_KINDS, type BlockedRange, type BlockKind, fieldAria, must, toastDbError, TIME_RE, vText } from "./data";

const K = "admin.settings.availability.blocks";

const schema = z
  .object({
    kind: z.enum(["day_off", "holiday", "closure", "custom"]),
    all_day: z.boolean(),
    start_date: z.string(),
    end_date: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    reason: vText(200),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, key: string) => ctx.addIssue({ code: "custom", path: [path], message: t(`admin.settings.v.${key}`) });
    if (!isValidLocalDate(v.start_date)) return issue("start_date", "date");
    if (v.all_day) {
      if (!isValidLocalDate(v.end_date)) return issue("end_date", "date");
      if (v.end_date < v.start_date) return issue("end_date", "dateOrder");
      return;
    }
    if (!TIME_RE.test(v.start_time)) return issue("start_time", "time");
    if (!TIME_RE.test(v.end_time)) return issue("end_time", "time");
    if (v.start_time >= v.end_time) return issue("end_time", "timeOrder");
  });
type Values = z.infer<typeof schema>;

/** Converts the form into the UTC range stored in the database (business time zone = Asia/Jerusalem). */
function toRange(v: Values): { starts_at: Date; ends_at: Date } | { error: keyof Values; key: string } {
  if (v.all_day) {
    return { starts_at: startOfLocalDayUtc(v.start_date), ends_at: startOfLocalDayUtc(addDaysToLocalDate(v.end_date, 1)) };
  }
  const starts = zonedWallTimeToUtc(v.start_date, timeStringToMinutes(v.start_time));
  if (!starts) return { error: "start_time", key: "dstGap" };
  const ends = zonedWallTimeToUtc(v.start_date, timeStringToMinutes(v.end_time));
  if (!ends) return { error: "end_time", key: "dstGap" };
  return { starts_at: starts, ends_at: ends };
}

/** Human description of a stored block: whole local days, or a time range. */
function describe(b: BlockedRange): string {
  const start = new Date(b.starts_at);
  const end = new Date(b.ends_at);
  const s = toZonedParts(start);
  const e = toZonedParts(end);
  if (s.minutesOfDay === 0 && e.minutesOfDay === 0) {
    const last = startOfLocalDayUtc(addDaysToLocalDate(e.date, -1));
    const days = s.date === addDaysToLocalDate(e.date, -1) ? formatDateAr(start) : `${formatDateAr(start)} – ${formatDateAr(last)}`;
    return `${days} · ${t(`${K}.allDayRange`)}`;
  }
  if (s.date === e.date) return `${formatDateAr(start)} · ⁦${formatTime(start)}–${formatTime(end)}⁩`;
  return `${formatDateAr(start)} ⁦${formatTime(start)}⁩ – ${formatDateAr(end)} ⁦${formatTime(end)}⁩`;
}

const fetchBlocks = async () =>
  must<BlockedRange[]>(
    await supabase
      .from("blocked_time_ranges")
      .select("id, kind, starts_at, ends_at, reason")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at"),
  );

export function BlocksCard() {
  const { data, loading, error, reload } = useAsync(fetchBlocks, []);
  const [toDelete, setToDelete] = useState<BlockedRange | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      must(await supabase.from("blocked_time_ranges").delete().eq("id", toDelete.id));
      toast.success(t(`${K}.deleted`));
      setToDelete(null);
      reload();
    } catch (e) {
      toastDbError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t(`${K}.title`)} text={t(`${K}.text`)}>
      <div className="space-y-5">
        <AddBlockForm onAdded={reload} />
        <h4 className="font-semibold">{t(`${K}.upcoming`)}</h4>
        {data ? (
          data.length === 0 ? (
            <EmptyText>{t(`${K}.empty`)}</EmptyText>
          ) : (
            <ul className="divide-y rounded-2xl border bg-white">
              {data.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="space-y-1">
                    <Badge variant={b.kind === "custom" ? "default" : "warning"}>{t(`${K}.kinds.${b.kind}`)}</Badge>
                    <p className="font-medium">{describe(b)}</p>
                    {b.reason && <p className="text-sm text-muted-foreground">{b.reason}</p>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setToDelete(b)} aria-label={`${t("admin.settings.common.delete")}: ${describe(b)}`}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <LoadState loading={loading} error={error} onRetry={reload} />
        )}
      </div>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t(`${K}.deleteTitle`)}
        description={toDelete ? `${describe(toDelete)} — ${t(`${K}.deleteText`)}` : undefined}
        confirmLabel={t("admin.settings.common.confirmDelete")}
        cancelLabel={t("admin.settings.common.keep")}
        destructive
        busy={busy}
        onConfirm={confirmDelete}
      />
    </Section>
  );
}

function AddBlockForm({ onAdded }: { onAdded: () => void }) {
  const today = toZonedParts(new Date()).date;
  const defaults: Values = { kind: "day_off", all_day: true, start_date: today, end_date: today, start_time: "", end_time: "", reason: "" };
  const { register, handleSubmit, reset, control, setError, setValue, getValues, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const allDay = useWatch({ control, name: "all_day" });
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    const range = toRange(v);
    if ("error" in range) return setError(range.error, { message: t(`admin.settings.v.${range.key}`) });
    if (range.ends_at.getTime() <= Date.now()) return setError(v.all_day ? "end_date" : "end_time", { message: t("admin.settings.v.pastEnd") });
    try {
      must(
        await supabase.from("blocked_time_ranges").insert({
          kind: v.kind,
          starts_at: range.starts_at.toISOString(),
          ends_at: range.ends_at.toISOString(),
          reason: v.reason || null,
        }),
      );
      toastSaved();
      reset({ ...defaults, kind: v.kind, all_day: v.all_day });
      onAdded();
    } catch (e) {
      toastDbError(e);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-2xl bg-secondary/40 p-4 sm:grid-cols-2">
      <Field id="block-kind" label={t(`${K}.kind`)}>
        <NativeSelect id="block-kind" {...register("kind")}>
          {BLOCK_KINDS.map((k: BlockKind) => (
            <option key={k} value={k}>
              {t(`${K}.kinds.${k}`)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="flex items-end">
        <CheckboxRow id="block-all-day" label={t(`${K}.allDay`)} help={t(`${K}.allDayHint`)} className="w-full" {...register("all_day")} />
      </div>
      <Field id="block-start-date" label={allDay ? t(`${K}.firstDate`) : t(`${K}.date`)} error={errors.start_date?.message}>
        <Input
          type="date"
          dir="ltr"
          min={today}
          {...fieldAria("block-start-date", errors.start_date?.message)}
          {...register("start_date", {
            onChange: (e: ChangeEvent<HTMLInputElement>) => {
              if (getValues("end_date") < e.target.value) setValue("end_date", e.target.value);
            },
          })}
        />
      </Field>
      {allDay ? (
        <Field id="block-end-date" label={t(`${K}.lastDate`)} error={errors.end_date?.message}>
          <Input type="date" dir="ltr" min={today} {...fieldAria("block-end-date", errors.end_date?.message)} {...register("end_date")} />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field id="block-start-time" label={t(`${K}.start`)} error={errors.start_time?.message}>
            <Input type="time" step={300} dir="ltr" {...fieldAria("block-start-time", errors.start_time?.message)} {...register("start_time")} />
          </Field>
          <Field id="block-end-time" label={t(`${K}.end`)} error={errors.end_time?.message}>
            <Input type="time" step={300} dir="ltr" {...fieldAria("block-end-time", errors.end_time?.message)} {...register("end_time")} />
          </Field>
        </div>
      )}
      <Field
        id="block-reason"
        label={`${t(`${K}.reason`)} ${t("admin.settings.common.optional")}`}
        error={errors.reason?.message}
        className="sm:col-span-2"
      >
        <Input placeholder={t(`${K}.reasonPlaceholder`)} {...fieldAria("block-reason", errors.reason?.message)} {...register("reason")} />
      </Field>
      <Button type="submit" disabled={formState.isSubmitting} className="sm:col-span-2 sm:justify-self-start">
        {formState.isSubmitting ? t("admin.settings.common.adding") : t(`${K}.add`)}
      </Button>
    </form>
  );
}
