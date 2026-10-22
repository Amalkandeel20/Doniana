import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { t } from "@/i18n";
import { supabase } from "@/lib/supabase";
import type { Service, ServiceCategory } from "@/types/models";
import { toastSaved } from "../adminApi";
import { CheckboxRow, Field } from "./common";
import { agorotToInput, fieldAria, must, parseShekels, removeImage, slugify, uploadImage, uploadOrDbError, vInt, vRequiredText, vText } from "./data";
import { type ImageChoice, ImagePicker } from "./ImagePicker";

const K = "admin.settings.services";

const schema = z.object({
  category: z.enum(["brows", "piercing"]),
  name_ar: vRequiredText(120),
  name_en: vRequiredText(120),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, t("admin.settings.v.slug")),
  description_ar: vText(600),
  description_en: vText(600),
  price: z.string().refine((v) => parseShekels(v) !== null, t("admin.settings.v.price")),
  duration_minutes: vInt(5, 600),
  sort_order: vInt(-9999, 9999),
  location_required: z.boolean(),
  is_active: z.boolean(),
});
type Values = z.infer<typeof schema>;

function defaults(service: Service | null, category: ServiceCategory): Values {
  return {
    category: service?.category ?? category,
    name_ar: service?.name_ar ?? "",
    name_en: service?.name_en ?? "",
    slug: service?.slug ?? "",
    description_ar: service?.description_ar ?? "",
    description_en: service?.description_en ?? "",
    price: service ? agorotToInput(service.price_agorot) : "",
    duration_minutes: service?.duration_minutes ?? 30,
    sort_order: service?.sort_order ?? 0,
    location_required: service?.location_required ?? false,
    is_active: service?.is_active ?? true,
  };
}

/** Main fields of a service. Calls onSaved with the service id (new or existing). */
export function ServiceForm({
  service,
  category,
  nextSortOrder,
  onSaved,
}: {
  service: Service | null;
  category: ServiceCategory;
  nextSortOrder: number;
  onSaved: (id: string) => void;
}) {
  const initial = defaults(service, category);
  if (!service) initial.sort_order = nextSortOrder;
  const { register, handleSubmit, reset, control, setValue, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const [image, setImage] = useState<ImageChoice>({ file: null, remove: false });
  const [slugTouched, setSlugTouched] = useState(!!service);
  const nameAr = useWatch({ control, name: "name_ar" });
  const errors = formState.errors;
  const err = (name: keyof Values) => errors[name]?.message;

  const onSubmit = handleSubmit(async (v) => {
    const oldPath = service?.image_path ?? null;
    let uploaded: string | null = null;
    try {
      if (image.file) uploaded = await uploadImage("service-images", image.file);
      const imagePath = uploaded ?? (image.remove ? null : oldPath);
      const row = {
        category: v.category,
        name_ar: v.name_ar,
        name_en: v.name_en,
        slug: v.slug,
        description_ar: v.description_ar || null,
        description_en: v.description_en || null,
        price_agorot: parseShekels(v.price)!,
        duration_minutes: v.duration_minutes,
        sort_order: v.sort_order,
        location_required: v.location_required,
        is_active: v.is_active,
        image_path: imagePath,
      };
      let id = service?.id;
      try {
        if (id) must(await supabase.from("services").update(row).eq("id", id));
        else id = must<{ id: string }>(await supabase.from("services").insert(row).select("id").single()).id;
      } catch (e) {
        if (uploaded) await removeImage("service-images", uploaded);
        throw e;
      }
      if (oldPath && oldPath !== imagePath) await removeImage("service-images", oldPath);
      setImage({ file: null, remove: false });
      reset(v);
      if (service) toastSaved();
      else toast.success(t(`${K}.created`));
      onSaved(id);
    } catch (e) {
      uploadOrDbError(e);
    }
  });

  const text = (name: "name_ar" | "name_en" | "slug", label: string, opts: { ltr?: boolean; help?: string } = {}) => (
    <Field id={`svc-${name}`} label={label} help={opts.help} error={err(name)}>
      <Input
        dir={opts.ltr ? "ltr" : undefined}
        {...fieldAria(`svc-${name}`, err(name), !!opts.help)}
        {...register(name, {
          onChange:
            name === "name_en" && !slugTouched
              ? (e: { target: { value: string } }) => setValue("slug", slugify(e.target.value))
              : name === "slug"
                ? () => setSlugTouched(true)
                : undefined,
        })}
      />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">{t(`${K}.snapshotNote`)}</p>
      <ImagePicker currentPath={service?.image_path ?? null} value={image} onChange={setImage} alt={t(`${K}.imageAlt`, { name: nameAr })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="svc-category" label={t(`${K}.category`)}>
          <NativeSelect id="svc-category" {...register("category")}>
            <option value="brows">{t("categories.brows.ar")}</option>
            <option value="piercing">{t("categories.piercing.ar")}</option>
          </NativeSelect>
        </Field>
        <Field id="svc-sort" label={t(`${K}.sortOrder`)} help={t(`${K}.sortOrderHelp`)} error={err("sort_order")}>
          <Input type="number" inputMode="numeric" dir="ltr" {...fieldAria("svc-sort", err("sort_order"), true)} {...register("sort_order", { valueAsNumber: true })} />
        </Field>
        {text("name_ar", t(`${K}.nameAr`))}
        {text("name_en", t(`${K}.nameEn`), { ltr: true })}
        {text("slug", t(`${K}.slug`), { ltr: true, help: t(`${K}.slugHelp`) })}
        <div className="grid grid-cols-2 gap-3">
          <Field id="svc-price" label={t(`${K}.price`)} error={err("price")}>
            <Input inputMode="decimal" dir="ltr" placeholder="120" {...fieldAria("svc-price", err("price"))} {...register("price")} />
          </Field>
          <Field id="svc-duration" label={t(`${K}.duration`)} error={err("duration_minutes")}>
            <Input
              type="number"
              inputMode="numeric"
              dir="ltr"
              {...fieldAria("svc-duration", err("duration_minutes"))}
              {...register("duration_minutes", { valueAsNumber: true })}
            />
          </Field>
        </div>
        <Field id="svc-description_ar" label={`${t(`${K}.descriptionAr`)} ${t("admin.settings.common.optional")}`} error={err("description_ar")} className="sm:col-span-2">
          <Textarea {...fieldAria("svc-description_ar", err("description_ar"))} {...register("description_ar")} />
        </Field>
        <Field id="svc-description_en" label={`${t(`${K}.descriptionEn`)} ${t("admin.settings.common.optional")}`} error={err("description_en")} className="sm:col-span-2">
          <Textarea dir="ltr" {...fieldAria("svc-description_en", err("description_en"))} {...register("description_en")} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxRow id="svc-active" label={t(`${K}.isActive`)} help={t(`${K}.isActiveHelp`)} {...register("is_active")} />
        <CheckboxRow id="svc-location" label={t(`${K}.locationRequired`)} {...register("location_required")} />
      </div>
      <Button type="submit" disabled={formState.isSubmitting} className="w-full sm:w-auto">
        {formState.isSubmitting ? t("admin.settings.common.saving") : t("admin.settings.common.save")}
      </Button>
    </form>
  );
}
