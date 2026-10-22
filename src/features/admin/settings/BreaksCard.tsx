import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { ARABIC_WEEKDAYS } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { toastSaved } from "../adminApi";
import { EmptyText, Field, LoadState, Section } from "./common";
import { type BusinessBreak, fieldAria, must, toastDbError, toTimeInput, vText, vTime } from "./data";

const schema = z
  .object({ weekday: z.string(), start_time: vTime, end_time: vTime, label: vText(80) })
  .refine((v) => v.start_time < v.end_time, { path: ["end_time"], message: t("admin.settings.v.timeOrder") });
type Values = z.infer<typeof schema>;

const fetchBreaks = async () =>
  must<BusinessBreak[]>(
    await supabase
      .from("business_breaks")
      .select("id, weekday, start_time, end_time, label")
      .order("weekday", { ascending: true, nullsFirst: true })
      .order("start_time"),
  );

const dayName = (weekday: number | null) => (weekday === null ? t("admin.settings.common.everyDay") : ARABIC_WEEKDAYS[weekday]!);

export function BreaksCard() {
  const { data, loading, error, reload } = useAsync(fetchBreaks, []);
  const [toDelete, setToDelete] = useState<BusinessBreak | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      must(await supabase.from("business_breaks").delete().eq("id", toDelete.id));
      toast.success(t("admin.settings.availability.breaks.deleted"));
      setToDelete(null);
      reload();
    } catch (e) {
      toastDbError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t("admin.settings.availability.breaks.title")} text={t("admin.settings.availability.breaks.text")}>
      <div className="space-y-5">
        {data ? (
          data.length === 0 ? (
            <EmptyText>{t("admin.settings.availability.breaks.empty")}</EmptyText>
          ) : (
            <ul className="divide-y rounded-2xl border bg-white">
              {data.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">
                      {dayName(b.weekday)} ·{" "}
                      <span className="ltr">
                        {toTimeInput(b.start_time)}–{toTimeInput(b.end_time)}
                      </span>
                    </p>
                    {b.label && <p className="text-sm text-muted-foreground">{b.label}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setToDelete(b)}
                    aria-label={`${t("admin.settings.common.delete")}: ${dayName(b.weekday)} ${toTimeInput(b.start_time)}`}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <LoadState loading={loading} error={error} onRetry={reload} />
        )}
        <AddBreakForm onAdded={reload} />
      </div>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t("admin.settings.availability.breaks.deleteTitle")}
        description={t("admin.settings.availability.breaks.deleteText")}
        confirmLabel={t("admin.settings.common.confirmDelete")}
        cancelLabel={t("admin.settings.common.keep")}
        destructive
        busy={busy}
        onConfirm={confirmDelete}
      />
    </Section>
  );
}

function AddBreakForm({ onAdded }: { onAdded: () => void }) {
  const { register, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { weekday: "all", start_time: "", end_time: "", label: "" },
  });
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    try {
      must(
        await supabase.from("business_breaks").insert({
          weekday: v.weekday === "all" ? null : Number(v.weekday),
          start_time: v.start_time,
          end_time: v.end_time,
          label: v.label || null,
        }),
      );
      toastSaved();
      reset();
      onAdded();
    } catch (e) {
      toastDbError(e);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-2xl bg-secondary/40 p-4 sm:grid-cols-2">
      <Field id="break-weekday" label={t("admin.settings.availability.breaks.weekday")}>
        <NativeSelect id="break-weekday" {...register("weekday")}>
          <option value="all">{t("admin.settings.common.everyDay")}</option>
          {ARABIC_WEEKDAYS.map((name, i) => (
            <option key={i} value={String(i)}>
              {name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="break-label" label={`${t("admin.settings.availability.breaks.label")} ${t("admin.settings.common.optional")}`} error={errors.label?.message}>
        <Input placeholder={t("admin.settings.availability.breaks.labelPlaceholder")} {...fieldAria("break-label", errors.label?.message)} {...register("label")} />
      </Field>
      <Field id="break-start" label={t("admin.settings.availability.breaks.start")} error={errors.start_time?.message}>
        <Input type="time" step={300} dir="ltr" {...fieldAria("break-start", errors.start_time?.message)} {...register("start_time")} />
      </Field>
      <Field id="break-end" label={t("admin.settings.availability.breaks.end")} error={errors.end_time?.message}>
        <Input type="time" step={300} dir="ltr" {...fieldAria("break-end", errors.end_time?.message)} {...register("end_time")} />
      </Field>
      <Button type="submit" disabled={formState.isSubmitting} className="sm:col-span-2 sm:justify-self-start">
        {formState.isSubmitting ? t("admin.settings.common.adding") : t("admin.settings.availability.breaks.add")}
      </Button>
    </form>
  );
}
