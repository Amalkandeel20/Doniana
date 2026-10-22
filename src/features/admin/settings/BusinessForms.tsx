// Business info and notification settings (single-row tables, id = true).
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { normalizeIsraeliMobile } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { BusinessSettings } from "@/types/models";
import { toastSaved } from "../adminApi";
import { CheckboxRow, Field, LoadState, Section } from "./common";
import { fieldAria, must, type NotificationSettingsRow, toastDbError, vInt, vText } from "./data";

const K = "admin.settings.settings";

const vPhone = z
  .string()
  .trim()
  .refine((v) => v === "" || normalizeIsraeliMobile(v) !== null, t("admin.settings.v.phone"));
const vUrl = vText(500).refine((v) => {
  if (v === "") return true;
  if (!v.startsWith("https://")) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}, t("admin.settings.v.url"));
const phoneOrNull = (v: string) => (v ? normalizeIsraeliMobile(v) : null);
/** +972541234567 → 0541234567 so the owner edits the familiar local form. */
const phoneInput = (e164: string | null) => (e164?.startsWith("+972") ? `0${e164.slice(4)}` : (e164 ?? ""));

function SaveRow({ submitting, dirty }: { submitting: boolean; dirty: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? t("admin.settings.common.saving") : t("admin.settings.common.save")}
      </Button>
      {dirty && <span className="text-sm text-amber-800">{t("admin.settings.common.unsaved")}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- business info

const businessSchema = z.object({
  business_name: vText(80),
  tagline: vText(120),
  instagram_url: vUrl,
  whatsapp_phone: vPhone,
  contact_phone: vPhone,
  address_ar: vText(300),
  maps_url: vUrl,
});
type BusinessValues = z.infer<typeof businessSchema>;

const fetchBusiness = async (): Promise<BusinessValues> => {
  const row = must<BusinessSettings>(
    await supabase
      .from("business_settings")
      .select("business_name, tagline, instagram_url, whatsapp_phone, contact_phone, address_ar, maps_url")
      .eq("id", true)
      .single(),
  );
  return {
    business_name: row.business_name,
    tagline: row.tagline,
    instagram_url: row.instagram_url ?? "",
    whatsapp_phone: phoneInput(row.whatsapp_phone),
    contact_phone: phoneInput(row.contact_phone),
    address_ar: row.address_ar ?? "",
    maps_url: row.maps_url ?? "",
  };
};

export function BusinessInfoCard() {
  const { data, loading, error, reload } = useAsync(fetchBusiness, []);
  return (
    <Section title={t(`${K}.business.title`)} text={t(`${K}.business.text`)}>
      {data ? <BusinessForm initial={data} /> : <LoadState loading={loading} error={error} onRetry={reload} />}
    </Section>
  );
}

function BusinessForm({ initial }: { initial: BusinessValues }) {
  const { register, handleSubmit, reset, formState } = useForm<BusinessValues>({ resolver: zodResolver(businessSchema), defaultValues: initial });
  const e = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    try {
      must(
        await supabase
          .from("business_settings")
          .update({
            business_name: v.business_name || "DONIANA",
            tagline: v.tagline,
            instagram_url: v.instagram_url || null,
            whatsapp_phone: phoneOrNull(v.whatsapp_phone),
            contact_phone: phoneOrNull(v.contact_phone),
            address_ar: v.address_ar || null,
            maps_url: v.maps_url || null,
          })
          .eq("id", true),
      );
      toastSaved();
      reset({ ...v, business_name: v.business_name || "DONIANA" });
    } catch (err) {
      toastDbError(err);
    }
  });

  const input = (name: keyof BusinessValues, label: string, opts: { ltr?: boolean; help?: string; type?: string; placeholder?: string } = {}) => {
    const id = `biz-${name}`;
    return (
      <Field id={id} label={label} help={opts.help} error={e[name]?.message}>
        <Input
          type={opts.type ?? "text"}
          dir={opts.ltr ? "ltr" : undefined}
          placeholder={opts.placeholder}
          inputMode={opts.type === "tel" ? "tel" : undefined}
          {...fieldAria(id, e[name]?.message, !!opts.help)}
          {...register(name)}
        />
      </Field>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {input("business_name", t(`${K}.business.name`), { ltr: true, placeholder: "DONIANA" })}
        {input("tagline", t(`${K}.business.tagline`), { ltr: true })}
        {input("whatsapp_phone", t(`${K}.business.whatsapp`), { ltr: true, type: "tel", help: t(`${K}.business.phoneHelp`), placeholder: "050-123-4567" })}
        {input("contact_phone", t(`${K}.business.contactPhone`), { ltr: true, type: "tel", help: t(`${K}.business.phoneHelp`), placeholder: "050-123-4567" })}
        {input("instagram_url", t(`${K}.business.instagram`), { ltr: true, type: "url", help: t(`${K}.business.urlHelp`), placeholder: "https://instagram.com/…" })}
        {input("maps_url", t(`${K}.business.maps`), { ltr: true, type: "url", help: t(`${K}.business.urlHelp`), placeholder: "https://" })}
        <Field id="biz-address_ar" label={t(`${K}.business.address`)} error={e.address_ar?.message} className="sm:col-span-2">
          <Textarea className="min-h-[72px]" {...fieldAria("biz-address_ar", e.address_ar?.message)} {...register("address_ar")} />
        </Field>
      </div>
      <SaveRow submitting={formState.isSubmitting} dirty={formState.isDirty} />
    </form>
  );
}

// ---------------------------------------------------------------- notification settings

const notifySchema = z.object({
  owner_phone: vPhone,
  sms_enabled: z.boolean(),
  reminder_max_lateness_minutes: vInt(1, 720),
});
type NotifyValues = z.infer<typeof notifySchema>;

const fetchNotify = async (): Promise<NotifyValues> => {
  const row = must<NotificationSettingsRow>(
    await supabase.from("notification_settings").select("owner_phone, sms_enabled, reminder_max_lateness_minutes").eq("id", true).single(),
  );
  return { ...row, owner_phone: phoneInput(row.owner_phone) };
};

export function NotificationSettingsCard() {
  const { data, loading, error, reload } = useAsync(fetchNotify, []);
  return (
    <Section title={t(`${K}.notify.title`)}>
      {data ? <NotifyForm initial={data} /> : <LoadState loading={loading} error={error} onRetry={reload} />}
    </Section>
  );
}

function NotifyForm({ initial }: { initial: NotifyValues }) {
  const { register, handleSubmit, reset, formState } = useForm<NotifyValues>({ resolver: zodResolver(notifySchema), defaultValues: initial });
  const e = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    try {
      must(
        await supabase
          .from("notification_settings")
          .update({ owner_phone: phoneOrNull(v.owner_phone), sms_enabled: v.sms_enabled, reminder_max_lateness_minutes: v.reminder_max_lateness_minutes })
          .eq("id", true),
      );
      toastSaved();
      reset(v);
    } catch (err) {
      toastDbError(err);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <CheckboxRow id="notify-sms" label={t(`${K}.notify.smsEnabled`)} help={t(`${K}.notify.smsEnabledHelp`)} {...register("sms_enabled")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="notify-owner" label={t(`${K}.notify.ownerPhone`)} help={t(`${K}.notify.ownerPhoneHelp`)} error={e.owner_phone?.message}>
          <Input
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="050-123-4567"
            autoComplete="tel"
            {...fieldAria("notify-owner", e.owner_phone?.message, true)}
            {...register("owner_phone")}
          />
        </Field>
        <Field id="notify-lateness" label={t(`${K}.notify.lateness`)} help={t(`${K}.notify.latenessHelp`)} error={e.reminder_max_lateness_minutes?.message}>
          <Input
            type="number"
            inputMode="numeric"
            dir="ltr"
            className="max-w-32"
            {...fieldAria("notify-lateness", e.reminder_max_lateness_minutes?.message, true)}
            {...register("reminder_max_lateness_minutes", { valueAsNumber: true })}
          />
        </Field>
      </div>
      <SaveRow submitting={formState.isSubmitting} dirty={formState.isDirty} />
    </form>
  );
}
