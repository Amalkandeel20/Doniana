// Home page hero and category card photos (paths in the public 'portfolio' bucket on business_settings).
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { invalidateBusinessInfo } from "@/features/services/publicData";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { placeholders } from "@/lib/placeholders";
import { publicImageUrl, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { BusinessSettings } from "@/types/models";
import { LoadState, Section } from "./common";
import {
  IMAGE_ACCEPT,
  imageProblem,
  must,
  removeImage,
  uploadImage,
  uploadOrDbError,
} from "./data";

const K = "admin.settings.settings.photos";

type PhotoColumn =
  "hero_image_path" | "brows_card_image_path" | "piercing_card_image_path";
type Photos = Pick<BusinessSettings, PhotoColumn>;

const SLOTS: {
  column: PhotoColumn;
  label: string;
  help: string;
  placeholder: string;
  wide: boolean;
}[] = [
  {
    column: "hero_image_path",
    label: t(`${K}.hero`),
    help: t(`${K}.heroHelp`),
    placeholder: placeholders.hero,
    wide: true,
  },
  {
    column: "brows_card_image_path",
    label: t(`${K}.brows`),
    help: t(`${K}.cardHelp`),
    placeholder: placeholders.category.brows,
    wide: false,
  },
  {
    column: "piercing_card_image_path",
    label: t(`${K}.piercing`),
    help: t(`${K}.cardHelp`),
    placeholder: placeholders.category.piercing,
    wide: false,
  },
];

const fetchPhotos = async (): Promise<Photos> =>
  must<Photos>(
    await supabase
      .from("business_settings")
      .select(
        "hero_image_path, brows_card_image_path, piercing_card_image_path",
      )
      .eq("id", true)
      .single(),
  );

export function SitePhotosCard() {
  const { data, loading, error, reload } = useAsync(fetchPhotos, []);
  return (
    <Section title={t(`${K}.title`)} text={t(`${K}.text`)}>
      {data ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {SLOTS.map((slot) => (
            <PhotoSlot
              key={slot.column}
              {...slot}
              path={data[slot.column]}
              onChanged={reload}
            />
          ))}
        </div>
      ) : (
        <LoadState loading={loading} error={error} onRetry={reload} />
      )}
    </Section>
  );
}

function PhotoSlot({
  column,
  label,
  help,
  placeholder,
  wide,
  path,
  onChanged,
}: (typeof SLOTS)[number] & { path: string | null; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const id = `site-photo-${column}`;

  const save = async (next: string | null) => {
    must(
      await supabase
        .from("business_settings")
        .update({ [column]: next })
        .eq("id", true),
    );
    invalidateBusinessInfo();
    // The old file is no longer referenced; removal is best-effort.
    await removeImage("portfolio", path);
    onChanged();
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const problem = imageProblem(file, "portfolio");
    if (problem) return void toast.error(problem);
    setBusy(true);
    let uploaded: string | null = null;
    try {
      uploaded = await uploadImage("portfolio", file);
      await save(uploaded);
      toast.success(t(`${K}.saved`));
    } catch (err) {
      if (uploaded) await removeImage("portfolio", uploaded);
      uploadOrDbError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await save(null);
      toast.success(t(`${K}.removed`));
      setConfirming(false);
    } catch (err) {
      uploadOrDbError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("space-y-2", wide && "sm:col-span-2")} data-testid={id}>
      <p className="font-medium">{label}</p>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-secondary/50",
          wide ? "aspect-[16/7]" : "aspect-[4/3]",
        )}
      >
        <img
          src={publicImageUrl("portfolio", path) ?? placeholder}
          alt={label}
          className="size-full object-cover"
        />
        {!path && (
          <span className="absolute start-2 top-2 rounded-full bg-card/90 px-2.5 py-1 text-xs text-muted-foreground">
            {t(`${K}.placeholder`)}
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus />
          {busy
            ? t(`${K}.uploading`)
            : path
              ? t(`${K}.replace`)
              : t(`${K}.choose`)}
        </Button>
        {path && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            <X />
            {t(`${K}.remove`)}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{help}</p>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t(`${K}.remove`)}
        description={t(`${K}.removeConfirm`)}
        confirmLabel={t(`${K}.remove`)}
        cancelLabel={t("admin.settings.common.keep")}
        destructive
        busy={busy}
        onConfirm={remove}
      />
    </div>
  );
}
