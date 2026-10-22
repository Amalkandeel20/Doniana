import { useState } from "react";
import { Clock, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { formatDurationAr, formatShekels } from "@/lib/format";
import { placeholders } from "@/lib/placeholders";
import { publicImageUrl, supabase } from "@/lib/supabase";
import type { Service, ServiceCategory } from "@/types/models";
import { EmptyText, LoadState, PageHeader } from "../settings/common";
import { must } from "../settings/data";
import { ServiceDialog, type ServiceEditTarget } from "../settings/ServiceDialog";

const K = "admin.settings.services";
const CATEGORIES: ServiceCategory[] = ["brows", "piercing"];

const fetchServices = async () =>
  must<Service[]>(
    await supabase
      .from("services")
      .select("*, service_addons(*), service_locations(*)")
      .order("sort_order")
      .order("name_ar"),
  );

export default function ServicesPage() {
  const { data, loading, error, reload } = useAsync(fetchServices, []);
  const [target, setTarget] = useState<ServiceEditTarget | null>(null);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t(`${K}.title`)}
        text={t(`${K}.text`)}
        action={
          <Button onClick={() => setTarget({ id: null, category: "brows" })}>
            <Plus />
            {t(`${K}.add`)}
          </Button>
        }
      />
      {!data && <LoadState loading={loading} error={error} onRetry={reload} />}
      {data && (
        <div className="space-y-10">
          {CATEGORIES.map((category) => {
            const items = data.filter((s) => s.category === category);
            return (
              <section key={category} aria-labelledby={`cat-${category}`} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id={`cat-${category}`} className="text-xl font-semibold">
                    {t(`categories.${category}.ar`)}
                  </h2>
                  <Button variant="outline" size="sm" onClick={() => setTarget({ id: null, category })}>
                    <Plus />
                    {t(`${K}.add`)}
                  </Button>
                </div>
                {items.length === 0 ? (
                  <EmptyText>{t(`${K}.empty`)}</EmptyText>
                ) : (
                  <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((s) => (
                      <ServiceCard key={s.id} service={s} onEdit={() => setTarget({ id: s.id })} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      <ServiceDialog
        target={target}
        services={data ?? []}
        onClose={() => setTarget(null)}
        onCreated={(id) => {
          setTarget({ id });
          reload();
        }}
        onChanged={reload}
      />
    </div>
  );
}

function ServiceCard({ service, onEdit }: { service: Service; onEdit: () => void }) {
  const image = publicImageUrl("service-images", service.image_path) ?? placeholders.service[service.category];
  return (
    <li className="flex flex-col overflow-hidden rounded-3xl border bg-card">
      <img src={image} alt="" className={service.is_active ? "aspect-[4/3] w-full object-cover" : "aspect-[4/3] w-full object-cover opacity-50"} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold">{service.name_ar}</h3>
            <p className="ltr text-sm text-muted-foreground">{service.name_en}</p>
          </div>
          <Badge variant={service.is_active ? "confirmed" : "completed"}>
            {service.is_active ? t("admin.settings.common.active") : t("admin.settings.common.inactive")}
          </Badge>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-base font-semibold">{formatShekels(service.price_agorot)}</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="size-4" aria-hidden />
            {formatDurationAr(service.duration_minutes)}
          </span>
        </p>
        <Button variant="outline" size="sm" className="mt-auto" onClick={onEdit} aria-label={`${t("admin.settings.common.edit")}: ${service.name_ar}`}>
          <Pencil />
          {t("admin.settings.common.edit")}
        </Button>
      </div>
    </li>
  );
}
