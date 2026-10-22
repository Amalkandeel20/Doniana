import { useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { EmptyText, LoadState, PageHeader } from "../settings/common";
import { must, type OutboxRow, type OutboxStatus } from "../settings/data";
import { OutboxItem } from "../settings/OutboxItem";

const K = "admin.settings.notifications";
const PAGE = 50;

const FILTERS = {
  all: null,
  problems: ["failed", "unknown"],
  pending: ["pending", "processing"],
  sent: ["sent", "delivered"],
  dev: ["dev_logged"],
} satisfies Record<string, OutboxStatus[] | null>;
type Filter = keyof typeof FILTERS;

async function fetchOutbox(filter: Filter, limit: number) {
  let query = supabase
    .from("notification_outbox")
    .select("*, appointments(reference, customer_name, starts_at)")
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  const statuses = FILTERS[filter];
  if (statuses) query = query.in("status", statuses);
  const rows = must<OutboxRow[]>(await query);
  const dev = await supabase.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", "dev_logged");
  if (dev.error) throw dev.error;
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit, hasDevLogged: (dev.count ?? 0) > 0 };
}

export default function NotificationsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const { data, loading, error, reload } = useAsync(() => fetchOutbox(filter, limit), [filter, limit]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t(`${K}.title`)}
        text={t(`${K}.text`)}
        action={
          <Button variant="outline" size="icon" onClick={reload} disabled={loading} aria-label={t("admin.settings.common.refresh")}>
            <RefreshCw className={loading ? "animate-spin" : undefined} />
          </Button>
        }
      />
      {data?.hasDevLogged && (
        <div role="note" className="mb-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{t(`${K}.devBanner`)}</p>
        </div>
      )}
      <div role="group" aria-label={t(`${K}.filters.label`)} className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            aria-pressed={filter === f}
            className="shrink-0"
            onClick={() => {
              setFilter(f);
              setLimit(PAGE);
            }}
          >
            {t(`${K}.filters.${f}`)}
          </Button>
        ))}
      </div>
      {!data && <LoadState loading={loading} error={error} onRetry={reload} />}
      {data &&
        (data.rows.length === 0 ? (
          <EmptyText>{t(`${K}.empty`)}</EmptyText>
        ) : (
          <>
            <ul className="space-y-3">
              {data.rows.map((row) => (
                <OutboxItem key={row.id} row={row} onChanged={reload} />
              ))}
            </ul>
            {data.hasMore && (
              <Button variant="outline" className="mt-5 w-full" disabled={loading} onClick={() => setLimit((l) => l + PAGE)}>
                {t(`${K}.loadMore`)}
              </Button>
            )}
          </>
        ))}
    </div>
  );
}
