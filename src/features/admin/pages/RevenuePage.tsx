import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { adminRpc } from "../adminApi";

interface MonthRow {
  month: string; // YYYY-MM-DD (first day, Israel calendar)
  earned_agorot: number;
  expected_agorot: number;
  appointments: number;
}

const RANGES = [6, 12] as const;
const monthLong = new Intl.DateTimeFormat("ar-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" });
const monthOnly = new Intl.DateTimeFormat("ar-u-nu-latn", { month: "long", timeZone: "UTC" });
const asDate = (m: string) => new Date(`${m.slice(0, 10)}T00:00:00Z`);

/** ₪1,234 — whole shekels with thousands separators, isolated for RTL text. */
function shekels(agorot: number): string {
  return `⁦₪${Math.round(agorot / 100).toLocaleString("en-US")}⁩`;
}

// Expected revenue is the same measure as earned, so it shares the ink colour and is told apart by
// a diagonal hatch (works in colour-blind, print and forced-colours modes) plus the legend.
const HATCH = "repeating-linear-gradient(135deg, hsl(var(--primary) / 0.6) 0 2px, transparent 2px 6px)";

export default function RevenuePage() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(6);
  const [active, setActive] = useState<string | null>(null);
  const data = useAsync(async () => {
    const rows = await adminRpc<MonthRow[]>("admin_monthly_revenue", { p_months: 12 });
    return rows.map((r) => ({ ...r, earned_agorot: Number(r.earned_agorot), expected_agorot: Number(r.expected_agorot) }));
  }, []);

  const rows = useMemo(() => (data.data ?? []).slice(-range), [data.data, range]);
  const current = data.data?.at(-1);
  const max = Math.max(1, ...rows.map((r) => r.earned_agorot + r.expected_agorot));
  const periodTotal = rows.reduce((s, r) => s + r.earned_agorot, 0);
  const hasAny = rows.some((r) => r.appointments > 0);
  const activeRow = rows.find((r) => r.month === active) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl">{t("admin.revenue.title")}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("admin.revenue.text")}</p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label={t("admin.revenue.range")}>
          {RANGES.map((n) => (
            <Button key={n} size="sm" variant={range === n ? "default" : "outline"} aria-pressed={range === n} onClick={() => setRange(n)}>
              {t("admin.revenue.months", { n })}
            </Button>
          ))}
          <Button size="icon" variant="ghost" onClick={data.reload} aria-label={t("admin.revenue.retry")}>
            <RotateCcw aria-hidden />
          </Button>
        </div>
      </div>

      {data.loading && !data.data && <Spinner className="mt-6" />}
      {data.error !== undefined && (
        <div role="alert" className="rounded-3xl bg-destructive/5 p-5">
          <p>{t("admin.revenue.loadError")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={data.reload}>
            {t("admin.revenue.retry")}
          </Button>
        </div>
      )}

      {data.data && (
        <>
          {/* Headline figures */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={t("admin.revenue.thisMonthEarned")} value={shekels(current?.earned_agorot ?? 0)} sub={current ? monthLong.format(asDate(current.month)) : ""} strong />
            <Stat label={t("admin.revenue.thisMonthExpected")} value={shekels(current?.expected_agorot ?? 0)} sub={t("admin.revenue.appointments", { n: current?.appointments ?? 0 })} />
            <Stat label={t("admin.revenue.periodTotal", { n: range })} value={shekels(periodTotal)} sub={t("admin.revenue.earned")} />
          </div>

          {/* Monthly bars */}
          <section className="rounded-3xl border bg-card p-4 sm:p-6" aria-labelledby="revenue-chart-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="revenue-chart-title" className="font-semibold">
                {t("admin.revenue.chartLabel")}
              </h2>
              <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <span className="inline-block size-3 rounded-sm bg-primary" aria-hidden /> {t("admin.revenue.earned")}
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="inline-block size-3 rounded-sm border border-primary/60" style={{ backgroundImage: HATCH }} aria-hidden />
                  {t("admin.revenue.expected")}
                </li>
              </ul>
            </div>

            {!hasAny && <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.revenue.empty")}</p>}

            <div className="relative">
              {/* Tooltip for the hovered / focused month */}
              <div className="mb-2 min-h-[3.25rem] text-sm" aria-live="polite">
                {activeRow && (
                  <div className="inline-flex flex-wrap gap-x-4 gap-y-0.5 rounded-2xl bg-secondary px-3 py-2">
                    <span className="font-semibold">{monthLong.format(asDate(activeRow.month))}</span>
                    <span>
                      {t("admin.revenue.earned")}: <b>{shekels(activeRow.earned_agorot)}</b>
                    </span>
                    {activeRow.expected_agorot > 0 && (
                      <span>
                        {t("admin.revenue.expected")}: <b>{shekels(activeRow.expected_agorot)}</b>
                      </span>
                    )}
                    <span className="text-muted-foreground">{t("admin.revenue.appointments", { n: activeRow.appointments })}</span>
                  </div>
                )}
              </div>

              <div className="relative h-56 border-b border-border">
                {/* recessive gridlines at 50% and 100% of the max */}
                {[0.5, 1].map((f) => (
                  <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/70" style={{ bottom: `${f * 100}%` }}>
                    <span className="absolute -top-2.5 end-0 bg-card ps-1 text-[0.65rem] text-muted-foreground">{shekels(max * f)}</span>
                  </div>
                ))}
                <div className="relative flex h-full items-end gap-1.5 pe-12 sm:gap-3">
                  {rows.map((r) => {
                    const total = r.earned_agorot + r.expected_agorot;
                    const isCurrent = r.month === current?.month;
                    return (
                      <button
                        key={r.month}
                        type="button"
                        className="group flex h-full flex-1 flex-col items-stretch justify-end rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onMouseEnter={() => setActive(r.month)}
                        onFocus={() => setActive(r.month)}
                        onClick={() => setActive(r.month)}
                        aria-label={`${monthLong.format(asDate(r.month))}: ${t("admin.revenue.earned")} ${shekels(r.earned_agorot)}، ${t("admin.revenue.expected")} ${shekels(r.expected_agorot)}`}
                        data-testid={`revenue-bar-${r.month.slice(0, 7)}`}
                      >
                        {isCurrent && total > 0 && (
                          <span className="mb-1 text-center text-[0.65rem] font-semibold">{shekels(total)}</span>
                        )}
                        {r.expected_agorot > 0 && (
                          <span
                            className={cn("block w-full border border-b-0 border-primary/60", r.earned_agorot === 0 && "rounded-t")}
                            style={{ height: `${(r.expected_agorot / max) * 100}%`, backgroundImage: HATCH }}
                          />
                        )}
                        {r.earned_agorot > 0 && (
                          <span
                            className={cn(
                              "block w-full bg-primary transition-opacity group-hover:opacity-80",
                              r.expected_agorot === 0 && "rounded-t",
                              r.expected_agorot > 0 && "border-t-2 border-card",
                            )}
                            style={{ height: `${(r.earned_agorot / max) * 100}%` }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-1.5 pe-12 pt-2 sm:gap-3">
                {rows.map((r) => (
                  <span key={r.month} className={cn("flex-1 truncate text-center text-[0.65rem] text-muted-foreground", r.month === active && "font-semibold text-foreground")}>
                    {range === 6 ? monthOnly.format(asDate(r.month)) : Number(r.month.slice(5, 7))}
                  </span>
                ))}
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">{t("admin.revenue.earnedHint")}</p>
          </section>

          {/* Accessible table view */}
          <details className="rounded-3xl border bg-card p-4 sm:p-5">
            <summary className="cursor-pointer font-medium">{t("admin.revenue.showTable")}</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 text-start font-medium">{t("admin.revenue.month")}</th>
                    <th className="py-2 text-end font-medium">{t("admin.revenue.earned")}</th>
                    <th className="py-2 text-end font-medium">{t("admin.revenue.expected")}</th>
                    <th className="py-2 text-end font-medium">{t("admin.revenue.count")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...rows].reverse().map((r) => (
                    <tr key={r.month}>
                      <td className="py-2">{monthLong.format(asDate(r.month))}</td>
                      <td className="py-2 text-end tabular-nums">{shekels(r.earned_agorot)}</td>
                      <td className="py-2 text-end tabular-nums">{shekels(r.expected_agorot)}</td>
                      <td className="py-2 text-end tabular-nums">{r.appointments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-3xl border p-5", strong ? "bg-primary text-primary-foreground" : "bg-card")}>
      <p className={cn("text-sm", strong ? "text-primary-foreground/75" : "text-muted-foreground")}>{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      <p className={cn("mt-1 text-xs", strong ? "text-primary-foreground/65" : "text-muted-foreground")}>{sub}</p>
    </div>
  );
}
