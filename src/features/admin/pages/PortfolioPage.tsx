import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { publicImageUrl, supabase } from "@/lib/supabase";
import type { PortfolioImage } from "@/types/models";
import { EmptyText, LoadState, PageHeader } from "../settings/common";
import { IMAGE_ACCEPT, imageProblem, must, removeImage, toastDbError, uploadImage, uploadOrDbError } from "../settings/data";
import { PortfolioCard } from "../settings/PortfolioCard";

const K = "admin.settings.portfolio";

const fetchImages = async () =>
  must<PortfolioImage[]>(
    await supabase
      .from("portfolio_images")
      .select("id, storage_path, alt_ar, category, sort_order, is_published")
      .order("sort_order")
      .order("created_at"),
  );

export default function PortfolioPage() {
  const { data, loading, error, reload } = useAsync(fetchImages, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const [toDelete, setToDelete] = useState<PortfolioImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const images = data ?? [];

  const upload = async (files: File[]) => {
    const valid = files.filter((file) => {
      const problem = imageProblem(file, "portfolio");
      if (problem) toast.error(t(`${K}.skipped`, { name: file.name, reason: problem }));
      return !problem;
    });
    if (!valid.length) return;
    let sortOrder = Math.max(0, ...images.map((i) => i.sort_order));
    let done = 0;
    setProgress({ done, total: valid.length });
    for (const file of valid) {
      let path: string | null = null;
      try {
        path = await uploadImage("portfolio", file);
        sortOrder += 1;
        must(await supabase.from("portfolio_images").insert({ storage_path: path, alt_ar: "", sort_order: sortOrder, is_published: true }));
        done += 1;
        setProgress({ done, total: valid.length });
      } catch (e) {
        if (path) await removeImage("portfolio", path);
        uploadOrDbError(e);
      }
    }
    setProgress(null);
    if (done) toast.success(t(`${K}.uploaded`, { n: done }));
    reload();
  };

  /** Swaps an image with its neighbour; renumbers everything so sort_order stays unique and dense. */
  const move = async (index: number, direction: -1 | 1) => {
    const order = [...images];
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    const changes = order.map((img, i) => ({ img, sort: i + 1 })).filter(({ img, sort }) => img.sort_order !== sort);
    setMoving(true);
    try {
      const results = await Promise.all(changes.map(({ img, sort }) => supabase.from("portfolio_images").update({ sort_order: sort }).eq("id", img.id)));
      results.forEach((r) => must(r));
    } catch (e) {
      toastDbError(e);
    } finally {
      setMoving(false);
      reload();
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      must(await supabase.from("portfolio_images").delete().eq("id", toDelete.id));
      await removeImage("portfolio", toDelete.storage_path);
      toast.success(t(`${K}.deleted`));
      setToDelete(null);
      reload();
    } catch (e) {
      toastDbError(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t(`${K}.title`)}
        text={t(`${K}.text`)}
        action={
          <div className="flex flex-col items-start gap-1">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={IMAGE_ACCEPT}
              className="sr-only"
              aria-label={t(`${K}.upload`)}
              aria-describedby="portfolio-upload-help"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void upload(files);
              }}
            />
            <Button onClick={() => inputRef.current?.click()} disabled={!!progress || !data}>
              <Upload />
              {progress ? t(`${K}.uploading`, { done: Math.min(progress.done + 1, progress.total), total: progress.total }) : t(`${K}.upload`)}
            </Button>
          </div>
        }
      />
      <p id="portfolio-upload-help" className="-mt-3 mb-6 text-sm text-muted-foreground">
        {t(`${K}.uploadHelp`)}
      </p>
      {!data && <LoadState loading={loading} error={error} onRetry={reload} />}
      {data &&
        (images.length === 0 ? (
          <EmptyText>{t(`${K}.empty`)}</EmptyText>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy={moving}>
            {images.map((img, i) => (
              <PortfolioCard
                key={`${img.id}-${img.alt_ar}-${img.category ?? ""}`}
                image={img}
                position={i + 1}
                isFirst={i === 0}
                isLast={i === images.length - 1}
                disabled={moving || loading}
                onMove={(dir) => move(i, dir)}
                onDelete={() => setToDelete(img)}
                onChanged={reload}
              />
            ))}
          </ul>
        ))}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t(`${K}.deleteTitle`)}
        description={t(`${K}.deleteText`)}
        confirmLabel={t("admin.settings.common.confirmDelete")}
        cancelLabel={t("admin.settings.common.keep")}
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
      >
        {toDelete && (
          <img src={publicImageUrl("portfolio", toDelete.storage_path) ?? ""} alt="" className="mt-4 max-h-48 rounded-2xl object-cover" />
        )}
      </ConfirmDialog>
    </div>
  );
}
