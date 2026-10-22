import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { t } from "@/i18n";
import { supabase } from "@/lib/supabase";
import type { Service, ServiceCategory } from "@/types/models";
import { must, removeImage, toastDbError } from "./data";
import { ServiceForm } from "./ServiceForm";
import { AddonsEditor, LocationsEditor } from "./SubItemsEditors";

const K = "admin.settings.services";

export type ServiceEditTarget = { id: string } | { id: null; category: ServiceCategory };

/** Create/edit dialog. While editing, `service` comes from the page's freshly reloaded list. */
export function ServiceDialog({
  target,
  services,
  onClose,
  onCreated,
  onChanged,
}: {
  target: ServiceEditTarget | null;
  services: Service[];
  onClose: () => void;
  onCreated: (id: string) => void;
  onChanged: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const service = target?.id ? services.find((s) => s.id === target.id) ?? null : null;
  const category = service?.category ?? (target && "category" in target ? target.category : "brows");
  const nextSortOrder = Math.max(0, ...services.filter((s) => s.category === category).map((s) => s.sort_order)) + 1;

  const doDelete = async () => {
    if (!service) return;
    setDeleting(true);
    try {
      must(await supabase.from("services").delete().eq("id", service.id));
      await removeImage("service-images", service.image_path);
      toast.success(t(`${K}.deleted`));
      setConfirmDelete(false);
      onClose();
      onChanged();
    } catch (e) {
      setConfirmDelete(false);
      toastDbError(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent wide>
        <DialogTitle>{service ? t(`${K}.editTitle`) : t(`${K}.newTitle`)}</DialogTitle>
        <DialogDescription>{service ? service.name_ar : t(`${K}.saveFirst`)}</DialogDescription>
        <div className="mt-5 space-y-8">
          {target?.id && !service ? (
            <Spinner label={t("admin.settings.common.loading")} />
          ) : (
            <ServiceForm
              key={service?.id ?? "new"}
              service={service}
              category={category}
              nextSortOrder={nextSortOrder}
              onSaved={(id) => (service ? onChanged() : onCreated(id))}
            />
          )}
          {service && (
            <>
              <hr />
              <AddonsEditor serviceId={service.id} addons={service.service_addons} onChanged={onChanged} />
              {(service.category === "piercing" || service.location_required || service.service_locations.length > 0) && (
                <>
                  <hr />
                  <LocationsEditor serviceId={service.id} locations={service.service_locations} onChanged={onChanged} />
                </>
              )}
              <hr />
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
                {t(`${K}.delete`)}
              </Button>
            </>
          )}
        </div>
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t(`${K}.deleteTitle`)}
          description={t(`${K}.deleteText`)}
          confirmLabel={t("admin.settings.common.confirmDelete")}
          cancelLabel={t("admin.settings.common.keep")}
          destructive
          busy={deleting}
          onConfirm={doDelete}
        />
      </DialogContent>
    </Dialog>
  );
}
