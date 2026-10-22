// Add-ons and piercing locations of a service (edited inside the service dialog).
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Textarea } from "@/components/ui/input";
import { t } from "@/i18n";
import { formatShekels } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { ServiceAddon, ServiceLocation } from "@/types/models";
import { toastSaved } from "../adminApi";
import { CheckboxRow, EmptyText, Field } from "./common";
import { agorotToInput, fieldAria, must, parseShekels, slugify, toastDbError, vInt, vRequiredText, vText } from "./data";

const K = "admin.settings.services";
type Table = "service_addons" | "service_locations";

async function setActive(table: Table, id: string, isActive: boolean, onChanged: () => void) {
  try {
    must(await supabase.from(table).update({ is_active: isActive }).eq("id", id));
    toastSaved();
    onChanged();
  } catch (e) {
    toastDbError(e);
  }
}

function ItemRow({
  title,
  details,
  active,
  activeLabel,
  onToggle,
  onEdit,
}: {
  title: string;
  details: string;
  active: boolean;
  activeLabel: string;
  onToggle: (value: boolean) => void;
  onEdit: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">
          {title}{" "}
          <Badge variant={active ? "confirmed" : "completed"}>
            {active ? t("admin.settings.common.active") : t("admin.settings.common.inactive")}
          </Badge>
        </p>
        <p className="text-sm text-muted-foreground">{details}</p>
      </div>
      <div className="flex items-center gap-1">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3 text-sm hover:bg-secondary">
          <Checkbox checked={active} onChange={(e) => onToggle(e.target.checked)} aria-label={`${activeLabel}: ${title}`} />
          <span aria-hidden>{activeLabel}</span>
        </label>
        <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label={`${t("admin.settings.common.edit")}: ${title}`}>
          <Pencil />
        </Button>
      </div>
    </li>
  );
}

function FormButtons({ submitting, onCancel }: { submitting: boolean; onCancel: () => void }) {
  return (
    <div className="flex gap-3 sm:col-span-2">
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? t("admin.settings.common.saving") : t("admin.settings.common.save")}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onCancel}>
        {t("admin.settings.common.cancel")}
      </Button>
    </div>
  );
}

const minutesSuffix = (n: number) => (n ? ` · ${n > 0 ? "+" : ""}${n} ${t("admin.settings.common.minutes")}` : "");

// ---------------------------------------------------------------- add-ons

const addonSchema = z.object({
  name_ar: vRequiredText(120),
  name_en: vRequiredText(120),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, t("admin.settings.v.slug")),
  description_ar: vText(400),
  price: z.string().refine((v) => parseShekels(v) !== null, t("admin.settings.v.price")),
  extra_duration_minutes: vInt(0, 240),
  is_active: z.boolean(),
});
type AddonValues = z.infer<typeof addonSchema>;

export function AddonsEditor({ serviceId, addons, onChanged }: { serviceId: string; addons: ServiceAddon[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<ServiceAddon | "new" | null>(null);
  const sorted = [...addons].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <section className="space-y-3" aria-labelledby="addons-title">
      <div>
        <h3 id="addons-title" className="text-lg font-semibold">
          {t(`${K}.addons.title`)}
        </h3>
        <p className="text-sm text-muted-foreground">{t(`${K}.addons.text`)}</p>
      </div>
      {sorted.length === 0 ? (
        <EmptyText>{t(`${K}.addons.empty`)}</EmptyText>
      ) : (
        <ul className="divide-y rounded-2xl border bg-white">
          {sorted.map((a) => (
            <ItemRow
              key={a.id}
              title={a.name_ar}
              details={`${formatShekels(a.price_agorot)}${minutesSuffix(a.extra_duration_minutes)}`}
              active={a.is_active}
              activeLabel={t(`${K}.addons.isActive`)}
              onToggle={(v) => setActive("service_addons", a.id, v, onChanged)}
              onEdit={() => setEditing(a)}
            />
          ))}
        </ul>
      )}
      {editing ? (
        <AddonForm
          key={editing === "new" ? "new" : editing.id}
          serviceId={serviceId}
          addon={editing === "new" ? null : editing}
          nextSortOrder={Math.max(0, ...addons.map((a) => a.sort_order)) + 1}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus />
          {t(`${K}.addons.add`)}
        </Button>
      )}
    </section>
  );
}

function AddonForm({
  serviceId,
  addon,
  nextSortOrder,
  onDone,
  onCancel,
}: {
  serviceId: string;
  addon: ServiceAddon | null;
  nextSortOrder: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, setValue, formState } = useForm<AddonValues>({
    resolver: zodResolver(addonSchema),
    defaultValues: {
      name_ar: addon?.name_ar ?? "",
      name_en: addon?.name_en ?? "",
      slug: addon?.slug ?? "",
      description_ar: addon?.description_ar ?? "",
      price: addon ? agorotToInput(addon.price_agorot) : "",
      extra_duration_minutes: addon?.extra_duration_minutes ?? 0,
      is_active: addon?.is_active ?? true,
    },
  });
  const [slugTouched, setSlugTouched] = useState(!!addon);
  const e = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    const row = {
      name_ar: v.name_ar,
      name_en: v.name_en,
      slug: v.slug,
      description_ar: v.description_ar || null,
      price_agorot: parseShekels(v.price)!,
      extra_duration_minutes: v.extra_duration_minutes,
      is_active: v.is_active,
    };
    try {
      if (addon) must(await supabase.from("service_addons").update(row).eq("id", addon.id));
      else must(await supabase.from("service_addons").insert({ ...row, service_id: serviceId, sort_order: nextSortOrder }));
      toastSaved();
      onDone();
    } catch (err) {
      toastDbError(err);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-2xl bg-secondary/40 p-4 sm:grid-cols-2" aria-label={addon ? t(`${K}.addons.editTitle`) : t(`${K}.addons.newTitle`)}>
      <h4 className="font-semibold sm:col-span-2">{addon ? t(`${K}.addons.editTitle`) : t(`${K}.addons.newTitle`)}</h4>
      <Field id="addon-name_ar" label={t(`${K}.nameAr`)} error={e.name_ar?.message}>
        <Input {...fieldAria("addon-name_ar", e.name_ar?.message)} {...register("name_ar")} />
      </Field>
      <Field id="addon-name_en" label={t(`${K}.nameEn`)} error={e.name_en?.message}>
        <Input
          dir="ltr"
          {...fieldAria("addon-name_en", e.name_en?.message)}
          {...register("name_en", { onChange: (ev: { target: { value: string } }) => !slugTouched && setValue("slug", slugify(ev.target.value)) })}
        />
      </Field>
      <Field id="addon-slug" label={t(`${K}.slug`)} help={t(`${K}.slugHelp`)} error={e.slug?.message}>
        <Input dir="ltr" {...fieldAria("addon-slug", e.slug?.message, true)} {...register("slug", { onChange: () => setSlugTouched(true) })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="addon-price" label={t(`${K}.price`)} error={e.price?.message}>
          <Input inputMode="decimal" dir="ltr" {...fieldAria("addon-price", e.price?.message)} {...register("price")} />
        </Field>
        <Field id="addon-extra" label={t(`${K}.addons.extraDuration`)} error={e.extra_duration_minutes?.message}>
          <Input
            type="number"
            inputMode="numeric"
            dir="ltr"
            {...fieldAria("addon-extra", e.extra_duration_minutes?.message)}
            {...register("extra_duration_minutes", { valueAsNumber: true })}
          />
        </Field>
      </div>
      <Field id="addon-desc" label={`${t(`${K}.descriptionAr`)} ${t("admin.settings.common.optional")}`} error={e.description_ar?.message} className="sm:col-span-2">
        <Textarea className="min-h-[72px]" {...fieldAria("addon-desc", e.description_ar?.message)} {...register("description_ar")} />
      </Field>
      <CheckboxRow id="addon-active" label={t(`${K}.addons.isActive`)} className="sm:col-span-2" {...register("is_active")} />
      <FormButtons submitting={formState.isSubmitting} onCancel={onCancel} />
    </form>
  );
}

// ---------------------------------------------------------------- piercing locations

const locationSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, t("admin.settings.v.code")),
  name_ar: vRequiredText(120),
  name_en: vRequiredText(120),
  price_delta: z.string().refine((v) => parseShekels(v, true) !== null, t("admin.settings.v.priceDelta")),
  duration_delta_minutes: vInt(-60, 240),
  is_active: z.boolean(),
});
type LocationValues = z.infer<typeof locationSchema>;

export function LocationsEditor({
  serviceId,
  locations,
  onChanged,
}: {
  serviceId: string;
  locations: ServiceLocation[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<ServiceLocation | "new" | null>(null);
  const sorted = [...locations].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <section className="space-y-3" aria-labelledby="locations-title">
      <div>
        <h3 id="locations-title" className="text-lg font-semibold">
          {t(`${K}.locations.title`)}
        </h3>
        <p className="text-sm text-muted-foreground">{t(`${K}.locations.text`)}</p>
      </div>
      {sorted.length === 0 ? (
        <EmptyText>{t(`${K}.locations.empty`)}</EmptyText>
      ) : (
        <ul className="divide-y rounded-2xl border bg-white">
          {sorted.map((l) => (
            <ItemRow
              key={l.id}
              title={l.name_ar}
              details={`${l.price_delta_agorot ? `${l.price_delta_agorot > 0 ? "+" : "-"}${formatShekels(Math.abs(l.price_delta_agorot))}` : ""}${minutesSuffix(l.duration_delta_minutes)}`.replace(/^ · /, "")}
              active={l.is_active}
              activeLabel={t(`${K}.locations.isActive`)}
              onToggle={(v) => setActive("service_locations", l.id, v, onChanged)}
              onEdit={() => setEditing(l)}
            />
          ))}
        </ul>
      )}
      {editing ? (
        <LocationForm
          key={editing === "new" ? "new" : editing.id}
          serviceId={serviceId}
          location={editing === "new" ? null : editing}
          nextSortOrder={Math.max(0, ...locations.map((l) => l.sort_order)) + 1}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus />
          {t(`${K}.locations.add`)}
        </Button>
      )}
    </section>
  );
}

function LocationForm({
  serviceId,
  location,
  nextSortOrder,
  onDone,
  onCancel,
}: {
  serviceId: string;
  location: ServiceLocation | null;
  nextSortOrder: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, setValue, formState } = useForm<LocationValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      code: location?.code ?? "",
      name_ar: location?.name_ar ?? "",
      name_en: location?.name_en ?? "",
      price_delta: location ? agorotToInput(location.price_delta_agorot) : "0",
      duration_delta_minutes: location?.duration_delta_minutes ?? 0,
      is_active: location?.is_active ?? true,
    },
  });
  const [codeTouched, setCodeTouched] = useState(!!location);
  const e = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    const row = {
      code: v.code,
      name_ar: v.name_ar,
      name_en: v.name_en,
      price_delta_agorot: parseShekels(v.price_delta, true)!,
      duration_delta_minutes: v.duration_delta_minutes,
      is_active: v.is_active,
    };
    try {
      if (location) must(await supabase.from("service_locations").update(row).eq("id", location.id));
      else must(await supabase.from("service_locations").insert({ ...row, service_id: serviceId, sort_order: nextSortOrder }));
      toastSaved();
      onDone();
    } catch (err) {
      toastDbError(err);
    }
  });

  const title = location ? t(`${K}.locations.editTitle`) : t(`${K}.locations.newTitle`);
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-2xl bg-secondary/40 p-4 sm:grid-cols-2" aria-label={title}>
      <h4 className="font-semibold sm:col-span-2">{title}</h4>
      <Field id="loc-name_ar" label={t(`${K}.nameAr`)} error={e.name_ar?.message}>
        <Input {...fieldAria("loc-name_ar", e.name_ar?.message)} {...register("name_ar")} />
      </Field>
      <Field id="loc-name_en" label={t(`${K}.nameEn`)} error={e.name_en?.message}>
        <Input
          dir="ltr"
          {...fieldAria("loc-name_en", e.name_en?.message)}
          {...register("name_en", { onChange: (ev: { target: { value: string } }) => !codeTouched && setValue("code", slugify(ev.target.value, 40)) })}
        />
      </Field>
      <Field id="loc-code" label={t(`${K}.locations.code`)} help={t(`${K}.locations.codeHelp`)} error={e.code?.message}>
        <Input dir="ltr" {...fieldAria("loc-code", e.code?.message, true)} {...register("code", { onChange: () => setCodeTouched(true) })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="loc-price" label={t(`${K}.locations.priceDelta`)} help={t(`${K}.locations.priceDeltaHelp`)} error={e.price_delta?.message}>
          <Input inputMode="decimal" dir="ltr" {...fieldAria("loc-price", e.price_delta?.message, true)} {...register("price_delta")} />
        </Field>
        <Field id="loc-duration" label={t(`${K}.locations.durationDelta`)} help={t(`${K}.locations.durationDeltaHelp`)} error={e.duration_delta_minutes?.message}>
          <Input
            type="number"
            inputMode="numeric"
            dir="ltr"
            {...fieldAria("loc-duration", e.duration_delta_minutes?.message, true)}
            {...register("duration_delta_minutes", { valueAsNumber: true })}
          />
        </Field>
      </div>
      <CheckboxRow id="loc-active" label={t(`${K}.locations.isActive`)} className="sm:col-span-2" {...register("is_active")} />
      <FormButtons submitting={formState.isSubmitting} onCancel={onCancel} />
    </form>
  );
}
