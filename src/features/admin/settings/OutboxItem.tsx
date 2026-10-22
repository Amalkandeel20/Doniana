import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { formatDateAr, formatTime } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { adminRpc, toastError } from "../adminApi";
import { LoadState } from "./common";
import { type DeliveryAttempt, must, type OutboxRow, type OutboxStatus } from "./data";

const K = "admin.settings.notifications";

const STATUS_VARIANT: Record<OutboxStatus, "default" | "confirmed" | "cancelled" | "completed" | "warning" | "dark"> = {
  pending: "default",
  processing: "default",
  sent: "confirmed",
  delivered: "confirmed",
  failed: "cancelled",
  cancelled: "completed",
  skipped: "completed",
  unknown: "warning",
  dev_logged: "dark",
};
const RETRYABLE: OutboxStatus[] = ["failed", "unknown", "skipped"];

const when = (iso: string | null) => (iso ? `${formatDateAr(new Date(iso))} ⁦${formatTime(new Date(iso))}⁩` : null);

export function OutboxItem({ row, onChanged }: { row: OutboxRow; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const appt = row.appointments;

  const retry = async () => {
    setBusy(true);
    try {
      await adminRpc("admin_retry_notification", { p_outbox_id: row.id });
      toast.success(t(`${K}.retried`));
      setConfirming(false);
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const facts: [string, string | null][] = [
    [t(`${K}.scheduled`), when(row.scheduled_at)],
    [t(`${K}.processed`), when(row.first_processed_at)],
    [t(`${K}.sentAt`), when(row.sent_at)],
    [t(`${K}.deliveredAt`), when(row.delivered_at)],
    [t(`${K}.attempts`), `⁦${row.attempts} / ${row.max_attempts}⁩`],
  ];
  const attemptsId = `attempts-${row.id}`;

  return (
    <li className="rounded-2xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="font-semibold">{t(`${K}.events.${row.event}`)}</p>
          <p className="text-sm text-muted-foreground">
            {t(`${K}.recipients.${row.recipient}`)}
            {appt && (
              <>
                {" · "}
                {t(`${K}.appointment`)} <span className="ltr font-mono">{appt.reference}</span>
                {appt.customer_name && ` · ${appt.customer_name}`}
                {` · ${when(appt.starts_at)}`}
              </>
            )}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[row.status]}>{t(`${K}.status.${row.status}`)}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {facts
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {row.last_error && (
        <p className="mt-3 rounded-xl bg-rose-50 p-2 text-sm text-rose-900">
          <span className="font-medium">{t(`${K}.lastError`)}: </span>
          <span className="ltr break-words">{row.last_error}</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" aria-expanded={expanded} aria-controls={attemptsId} onClick={() => setExpanded((v) => !v)}>
          <ChevronDown className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
          {expanded ? t(`${K}.hideAttempts`) : t(`${K}.showAttempts`)}
        </Button>
        {RETRYABLE.includes(row.status) && (
          <Button variant={row.status === "unknown" ? "outline" : "secondary"} size="sm" onClick={() => setConfirming(true)}>
            <RotateCcw />
            {t(`${K}.retry`)}
          </Button>
        )}
      </div>
      {expanded && (
        <div id={attemptsId}>
          <Attempts outboxId={row.id} />
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={row.status === "unknown" ? t(`${K}.retryUnknownTitle`) : t(`${K}.retryTitle`)}
        description={row.status === "unknown" ? t(`${K}.retryUnknownText`) : t(`${K}.retryText`)}
        confirmLabel={t(`${K}.retryConfirm`)}
        cancelLabel={t("admin.settings.common.keep")}
        destructive={row.status === "unknown"}
        busy={busy}
        onConfirm={retry}
      />
    </li>
  );
}

function Attempts({ outboxId }: { outboxId: string }) {
  const { data, loading, error, reload } = useAsync(
    async () =>
      must<DeliveryAttempt[]>(
        await supabase
          .from("notification_delivery_attempts")
          .select("id, attempt_no, provider, outcome, provider_status, error, started_at, finished_at")
          .eq("outbox_id", outboxId)
          .order("attempt_no"),
      ),
    [outboxId],
  );
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  if (data.length === 0) return <p className="mt-2 text-sm text-muted-foreground">{t(`${K}.noAttempts`)}</p>;
  return (
    <ol className="mt-2 space-y-2 border-s-2 ps-4">
      {data.map((a) => (
        <li key={a.id} className="text-sm">
          <p className="font-medium">
            {t(`${K}.attemptNo`, { n: a.attempt_no })} · {t(`${K}.outcomes.${a.outcome}`)}{" "}
            <span className="ltr text-muted-foreground">
              ({a.provider}
              {a.provider_status ? ` · ${a.provider_status}` : ""})
            </span>
          </p>
          <p className="text-muted-foreground">
            {when(a.started_at)}
            {a.finished_at && ` → ⁦${formatTime(new Date(a.finished_at))}⁩`}
          </p>
          {a.error && <p className="ltr break-words text-rose-900">{a.error}</p>}
        </li>
      ))}
    </ol>
  );
}
