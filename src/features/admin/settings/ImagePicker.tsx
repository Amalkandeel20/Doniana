import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";
import { publicImageUrl } from "@/lib/supabase";
import { IMAGE_ACCEPT, imageProblem } from "./data";

export interface ImageChoice {
  file: File | null;
  remove: boolean;
}

/** Image chooser for a service: the file is uploaded by the caller on save. */
export function ImagePicker({
  currentPath,
  value,
  onChange,
  alt,
}: {
  currentPath: string | null;
  value: ImageChoice;
  onChange: (value: ImageChoice) => void;
  alt: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrl = useMemo(() => (value.file ? URL.createObjectURL(value.file) : null), [value.file]);
  useEffect(() => () => void (objectUrl && URL.revokeObjectURL(objectUrl)), [objectUrl]);

  const shown = objectUrl ?? (value.remove ? null : publicImageUrl("service-images", currentPath));

  const pick = (file: File | undefined) => {
    if (!file) return;
    const problem = imageProblem(file, "service-images");
    if (problem) return void toast.error(problem);
    onChange({ file, remove: false });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="service-image">{t("admin.settings.services.image")}</Label>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-28 items-center justify-center overflow-hidden rounded-2xl border bg-secondary/50 text-center text-xs text-muted-foreground">
          {shown ? <img src={shown} alt={alt} className="size-full object-cover" /> : t("admin.settings.services.noImage")}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            id="service-image"
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            aria-describedby="service-image-help"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <ImagePlus />
            {shown ? t("admin.settings.services.replaceImage") : t("admin.settings.services.chooseImage")}
          </Button>
          {shown && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => onChange({ file: null, remove: true })}>
              <X />
              {t("admin.settings.services.removeImage")}
            </Button>
          )}
        </div>
      </div>
      <p id="service-image-help" className="text-sm text-muted-foreground">
        {t("admin.settings.services.imageHelp")} {value.file && t("admin.settings.services.imagePending")}
      </p>
    </div>
  );
}
