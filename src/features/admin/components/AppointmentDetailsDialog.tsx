import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, MessageCircle, Phone, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Checkbox, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { formatDateAr, formatDurationAr, formatPhoneForDisplay, formatShekels, formatTime, whatsappLink } from "@/lib/format";
import type { Appointment, AppointmentStatus } from "@/types/models";
import { toastError } from "../adminApi";
import {
  actorLabel,
  cancelAppointment,
  fetchAppointment,
  fetchAuditLog,
  setAppointmentStatus,
  statusLabel,
  type AuditEntry,
} from "../appointmentsData";
import { AppointmentFormDialog } from "./AppointmentFormDialog";

const K = "admin.appointments";

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge variant={status}>{statusLabel(status)}</Badge>;
}

type ConfirmKind = "cancel" | "complete" | "restore";

interface Props {
  /** The appointment to show; null keeps the dialog closed. */
  appointment: Appointment | null;
  onClose: () => void;
  /** Called after any successful change so lists/calendars can refresh. */
  onChanged: () => void;
}

export function AppointmentDetailsDialog({ appointment, onClose, onChanged }: Props) {
  const [current, setCurrent] = useState<Appointment | null>(appointment);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [historyNonce, setHistoryNonce] = useState(0);

  useEffect(() => {
    setCurrent(appointment);
    setEditing(false);
    setConfirm(null);
  }, [appointment]);

  const id = current?.id;
  const history = useAsync(() => (id ? fetchAuditLog(id) : Promise.resolve([])), [id, historyNonce]);

  async function refresh(appointmentId: string) {
    try {
      setCurrent(await fetchAppointment(appointmentId));
    } catch {
      // The change itself succeeded; the list refresh below will show the latest data.
    }
    setHistoryNonce((n) => n + 1);
    onChanged();
  }

  function openConfirm(kind: ConfirmKind) {
    setReason("");
    // Undoing "completed" rarely needs a message; restoring a cancelled booking usually does.
    setNotify(kind === "restore" ? current?.status === "cancelled" : true);
    setConfirm(kind);
  }

  async function runConfirmed() {
    if (!current || !confirm) return;
    setBusy(true);
    try {
      if (confirm === "cancel") await cancelAppointment(current.id, reason, notify);
      else if (confirm === "complete") await setAppointmentStatus(current.id, "completed", false);
      else await setAppointmentStatus(current.id, "confirmed", notify);
      toast.success(t(`${K}.toasts.${confirm === "cancel" ? "cancelled" : confirm === "complete" ? "completed" : "restored"}`));
      setConfirm(null);
      await refresh(current.id);
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;
  const a = current;
  const starts = new Date(a.starts_at);
  const name = a.customer_name ?? t(`${K}.details.anonymized`);
  const vars = { name, date: formatDateAr(starts), time: formatTime(starts) };

  return (
    <>
      <Dialog open={!!appointment && !editing} onOpenChange={(open) => !open && onClose()}>
        <DialogContent wide>
          <div className="flex flex-wrap items-center gap-2 pe-10">
            <DialogTitle className="pe-0">{name}</DialogTitle>
            <StatusBadge status={a.status} />
          </div>
          <DialogDescription>
            {vars.date} · <span className="ltr inline-block">{formatTime(starts)}–{formatTime(new Date(a.ends_at))}</span>
          </DialogDescription>

          {a.customer_phone && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <a href={`tel:${a.customer_phone}`}>
                  <Phone aria-hidden />
                  <span className="ltr">{formatPhoneForDisplay(a.customer_phone)}</span>
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={whatsappLink(a.customer_phone)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden />
                  {t(`${K}.list.whatsapp`)}
                </a>
              </Button>
            </div>
          )}

          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[0.95rem]">
            <Row label={t(`${K}.details.service`)}>{a.service_name_ar}</Row>
            {a.location_name_ar && <Row label={t(`${K}.details.location`)}>{a.location_name_ar}</Row>}
            {!!a.appointment_addons?.length && (
              <Row label={t(`${K}.details.addons`)}>
                {a.appointment_addons.map((x) => `${x.name_ar} (+${formatShekels(x.price_agorot)})`).join("، ")}
              </Row>
            )}
            <Row label={t(`${K}.details.duration`)}>{formatDurationAr(a.duration_minutes)}</Row>
            <Row label={t(`${K}.details.price`)}>
              <span className="font-semibold">{formatShekels(a.total_price_agorot)}</span>
            </Row>
            {a.notes && (
              <Row label={t(`${K}.details.notes`)}>
                <span className="whitespace-pre-wrap">{a.notes}</span>
              </Row>
            )}
            <Row label={t(`${K}.details.reference`)}>
              <span className="ltr inline-block font-mono text-sm">{a.reference}</span>
            </Row>
            <Row label={t(`${K}.details.source`)}>{t(`${K}.source.${a.source}`)}</Row>
            <Row label={t(`${K}.details.createdAt`)}>{dateTime(a.created_at)}</Row>
            {a.status === "cancelled" && a.cancelled_at && (
              <>
                <Row label={t(`${K}.details.cancelledAt`)}>{dateTime(a.cancelled_at)}</Row>
                {a.cancelled_by && <Row label={t(`${K}.details.cancelledBy`)}>{actorLabel(a.cancelled_by)}</Row>}
                {a.cancellation_reason && <Row label={t(`${K}.details.cancellationReason`)}>{a.cancellation_reason}</Row>}
              </>
            )}
            {a.status === "completed" && a.completed_at && (
              <Row label={t(`${K}.details.completedAt`)}>{dateTime(a.completed_at)}</Row>
            )}
          </dl>

          <section className="mt-6" aria-label={t(`${K}.details.actions`)}>
            <div className="grid gap-2 sm:grid-cols-2">
              {a.status !== "cancelled" && (
                <Button variant="default" onClick={() => setEditing(true)} disabled={!a.customer_name}>
                  <CalendarClock aria-hidden />
                  {t(`${K}.details.edit`)}
                </Button>
              )}
              {a.status === "confirmed" && (
                <Button variant="champagne" onClick={() => openConfirm("complete")} title={t(`${K}.details.completeHint`)}>
                  <Check aria-hidden />
                  {t(`${K}.details.complete`)}
                </Button>
              )}
              {a.status !== "confirmed" && (
                <Button variant="outline" onClick={() => openConfirm("restore")}>
                  <RotateCcw aria-hidden />
                  {t(`${K}.details.restore`)}
                </Button>
              )}
              {a.status === "confirmed" && (
                <Button variant="outline" className="border-rose-200 text-rose-800 hover:bg-rose-50" onClick={() => openConfirm("cancel")}>
                  <XCircle aria-hidden />
                  {t(`${K}.details.cancel`)}
                </Button>
              )}
            </div>
          </section>

          <section className="mt-7">
            <h3 className="font-semibold">{t(`${K}.details.history`)}</h3>
            <History state={history} />
          </section>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && !busy && setConfirm(null)}
        title={confirm ? t(`${K}.confirm.${confirm}Title`) : ""}
        description={confirm ? t(`${K}.confirm.${confirm}Text`, vars) : undefined}
        confirmLabel={busy ? t(`${K}.form.saving`) : confirm ? t(`${K}.confirm.${confirm}Confirm`) : ""}
        cancelLabel={t(`${K}.confirm.back`)}
        destructive={confirm === "cancel"}
        busy={busy}
        onConfirm={runConfirmed}
      >
        {confirm === "cancel" && (
          <div className="mt-4 space-y-2">
            <Label htmlFor="cancel-reason">{t(`${K}.confirm.reason`)}</Label>
            <Textarea
              id="cancel-reason"
              rows={2}
              maxLength={300}
              placeholder={t(`${K}.confirm.reasonPlaceholder`)}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
        {(confirm === "cancel" || confirm === "restore") && a.customer_phone && (
          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span className="font-medium">{t(`${K}.confirm.notify`)}</span>
          </label>
        )}
      </ConfirmDialog>

      <AppointmentFormDialog
        open={editing}
        onOpenChange={setEditing}
        appointment={a}
        onSaved={(saved) => void refresh(saved.id)}
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function dateTime(iso: string) {
  const d = new Date(iso);
  return (
    <>
      {formatDateAr(d)} <span className="ltr inline-block">{formatTime(d)}</span>
    </>
  );
}

function History({ state }: { state: { data?: AuditEntry[]; loading: boolean; error: unknown } }) {
  if (state.loading && !state.data) return <Spinner className="mt-3" />;
  if (state.error) return <p className="mt-2 text-sm text-destructive">{t(`${K}.details.historyError`)}</p>;
  if (!state.data?.length) return <p className="mt-2 text-sm text-muted-foreground">{t(`${K}.details.historyEmpty`)}</p>;
  return (
    <ol className="mt-3 space-y-3 border-s-2 border-champagne-light ps-4">
      {state.data.map((entry) => (
        <li key={entry.id} className="text-sm">
          <p className="font-medium">{historyTitle(entry.action)}</p>
          {historyDetail(entry) && <p className="text-muted-foreground">{historyDetail(entry)}</p>}
          <p className="text-xs text-muted-foreground">
            {dateTime(entry.created_at)} · {t(`${K}.history.by`, { actor: actorLabel(entry.actor) })}
          </p>
        </li>
      ))}
    </ol>
  );
}

function historyTitle(action: string): string {
  const key = `${K}.history.${action}`;
  const label = t(key);
  return label === key ? t(`${K}.history.other`) : label;
}

function historyDetail(entry: AuditEntry): string | null {
  if (entry.action !== "updated" || !entry.changes) return null;
  const changes = entry.changes as Record<string, { new?: unknown }>;
  const parts: string[] = [];
  const newStart = changes.starts_at?.new;
  if (typeof newStart === "string") {
    const d = new Date(newStart);
    parts.push(t(`${K}.history.movedTo`, { date: formatDateAr(d), time: formatTime(d) }));
  }
  const fields = Object.keys(changes)
    .filter((k) => k !== "starts_at")
    .map((k) => {
      const key = `${K}.history.fields.${k}`;
      const label = t(key);
      return label === key ? null : label;
    })
    .filter((x): x is string => !!x);
  if (fields.length) parts.push(t(`${K}.history.changed`, { fields: fields.join("، ") }));
  return parts.length ? parts.join(" — ") : null;
}
