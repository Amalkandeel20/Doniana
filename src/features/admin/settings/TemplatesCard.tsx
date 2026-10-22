import { useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { FieldError, Label } from "@/components/ui/label";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { toastSaved } from "../adminApi";
import { EmptyText, LoadState, Section } from "./common";
import { must, NOTIFICATION_EVENTS, type NotificationEvent, TEMPLATE_PLACEHOLDERS, toastDbError } from "./data";

const K = "admin.settings.settings.templates";

const schema = z.object({
  body_ar: z.string().min(1, t("admin.settings.v.required")).max(600, t("admin.settings.v.maxLength", { max: 600 })),
});
type Values = z.infer<typeof schema>;

/** Arabic text is sent as UCS-2: 70 UTF-16 units in one SMS, 67 per part when concatenated. */
function smsSegments(text: string): number {
  if (text.length === 0) return 0;
  return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
}

const fetchTemplates = async () => {
  const rows = must<{ event: NotificationEvent; body_ar: string }[]>(await supabase.from("notification_templates").select("event, body_ar"));
  return NOTIFICATION_EVENTS.flatMap((event) => rows.filter((r) => r.event === event));
};

export function TemplatesCard() {
  const { data, loading, error, reload } = useAsync(fetchTemplates, []);
  return (
    <Section title={t(`${K}.title`)} text={t(`${K}.text`)}>
      {!data ? (
        <LoadState loading={loading} error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyText>{t(`${K}.empty`)}</EmptyText>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">{t(`${K}.counterHelp`)}</p>
          {data.map((row) => (
            <TemplateForm key={row.event} event={row.event} initial={row.body_ar} />
          ))}
        </div>
      )}
    </Section>
  );
}

function TemplateForm({ event, initial }: { event: NotificationEvent; initial: string }) {
  const { register, handleSubmit, reset, setValue, getValues, control, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { body_ar: initial },
  });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const body = useWatch({ control, name: "body_ar" }) ?? "";
  const id = `tpl-${event}`;
  const { ref, ...field } = register("body_ar");
  const unknown = [...body.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)]
    .map((m) => m[1] ?? "")
    .filter((name) => !(TEMPLATE_PLACEHOLDERS as readonly string[]).includes(name));
  const error = formState.errors.body_ar?.message;

  const insert = (name: string) => {
    const el = textareaRef.current;
    const current = getValues("body_ar");
    const token = `{{${name}}}`;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    setValue("body_ar", current.slice(0, start) + token + current.slice(end), { shouldDirty: true, shouldValidate: true });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const onSubmit = handleSubmit(async (v) => {
    try {
      must(await supabase.from("notification_templates").update({ body_ar: v.body_ar }).eq("event", event));
      toastSaved();
      reset(v);
    } catch (e) {
      toastDbError(e);
    }
  });

  const eventName = t(`admin.settings.notifications.events.${event}`);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3 rounded-2xl border bg-white p-4">
      <Label htmlFor={id} className="text-base font-semibold">
        {eventName}
      </Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t(`${K}.text`)}>
        {TEMPLATE_PLACEHOLDERS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => insert(name)}
            aria-label={t(`${K}.insert`, { name: t(`${K}.placeholders.${name}`) })}
            className="min-h-9 rounded-full border bg-secondary/60 px-3 text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t(`${K}.placeholders.${name}`)}
          </button>
        ))}
      </div>
      <Textarea
        id={id}
        rows={5}
        aria-invalid={!!error}
        aria-describedby={`${id}-counter${error ? ` ${id}-error` : ""}`}
        ref={(el) => {
          ref(el);
          textareaRef.current = el;
        }}
        {...field}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span id={`${id}-counter`} aria-live="polite" className={body.length > 600 ? "text-destructive" : "text-muted-foreground"}>
          {t(`${K}.counter`, { chars: body.length, segments: smsSegments(body) })}
        </span>
        {unknown.length > 0 && <span className="text-amber-800">{t(`${K}.unknownPlaceholder`, { name: unknown.join("، ") })}</span>}
      </div>
      <FieldError id={`${id}-error`} message={error} />
      <Button type="submit" size="sm" disabled={formState.isSubmitting || !formState.isDirty}>
        {formState.isSubmitting ? t("admin.settings.common.saving") : t("admin.settings.common.save")}
      </Button>
    </form>
  );
}
