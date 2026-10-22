import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";
import { publicImageUrl, supabase } from "@/lib/supabase";
import type { PortfolioImage, ServiceCategory } from "@/types/models";
import { toastSaved } from "../adminApi";
import { must, toastDbError } from "./data";

const K = "admin.settings.portfolio";

export function PortfolioCard({
  image,
  position,
  isFirst,
  isLast,
  disabled,
  onMove,
  onDelete,
  onChanged,
}: {
  image: PortfolioImage;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const [alt, setAlt] = useState(image.alt_ar);
  const [category, setCategory] = useState<ServiceCategory | "">(image.category ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = alt.trim() !== image.alt_ar || (category || null) !== image.category;
  const id = `pf-${image.id}`;
  const label = t(`${K}.position`, { n: position });

  const update = async (patch: Partial<PortfolioImage>) => {
    setSaving(true);
    try {
      must(await supabase.from("portfolio_images").update(patch).eq("id", image.id));
      toastSaved();
      onChanged();
    } catch (e) {
      toastDbError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex flex-col overflow-hidden rounded-3xl border bg-card" aria-label={label}>
      <div className="relative">
        <img
          src={publicImageUrl("portfolio", image.storage_path) ?? ""}
          alt={image.alt_ar}
          loading="lazy"
          className={image.is_published ? "aspect-square w-full object-cover" : "aspect-square w-full object-cover opacity-50"}
        />
        <Badge variant={image.is_published ? "confirmed" : "completed"} className="absolute start-3 top-3">
          {image.is_published ? t(`${K}.published`) : t(`${K}.hidden`)}
        </Badge>
        <span className="absolute end-3 top-3 rounded-full bg-ink/70 px-2.5 py-0.5 text-xs text-ivory">{position}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <Label htmlFor={`${id}-alt`}>{t(`${K}.alt`)}</Label>
          <Input
            id={`${id}-alt`}
            value={alt}
            maxLength={200}
            placeholder={t(`${K}.altPlaceholder`)}
            onChange={(e) => setAlt(e.target.value)}
            aria-describedby={`${id}-alt-help`}
          />
          <p id={`${id}-alt-help`} className="text-xs text-muted-foreground">
            {t(`${K}.altHelp`)}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-cat`}>{t(`${K}.category`)}</Label>
          <NativeSelect id={`${id}-cat`} value={category} onChange={(e) => setCategory(e.target.value as ServiceCategory | "")}>
            <option value="">{t(`${K}.noCategory`)}</option>
            <option value="brows">{t("categories.brows.ar")}</option>
            <option value="piercing">{t("categories.piercing.ar")}</option>
          </NativeSelect>
        </div>
        {dirty && (
          <Button size="sm" disabled={saving} onClick={() => update({ alt_ar: alt.trim(), category: category || null })}>
            {saving ? t("admin.settings.common.saving") : t("admin.settings.common.save")}
          </Button>
        )}
        <label htmlFor={`${id}-pub`} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4">
          <Checkbox
            id={`${id}-pub`}
            checked={image.is_published}
            disabled={saving}
            onChange={(e) => update({ is_published: e.target.checked })}
          />
          <span className="font-medium">{t(`${K}.published`)}</span>
        </label>
        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button variant="outline" size="icon" disabled={disabled || isFirst} onClick={() => onMove(-1)} aria-label={`${t(`${K}.moveUp`)}: ${label}`}>
              <ArrowUp />
            </Button>
            <Button variant="outline" size="icon" disabled={disabled || isLast} onClick={() => onMove(1)} aria-label={`${t(`${K}.moveDown`)}: ${label}`}>
              <ArrowDown />
            </Button>
          </div>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`${t("admin.settings.common.delete")}: ${label}`}>
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </div>
    </li>
  );
}
