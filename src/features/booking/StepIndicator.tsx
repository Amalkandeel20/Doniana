import { Check } from "lucide-react";
import { messages, t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Step } from "./bookingState";

export function StepIndicator({ current, maxReachable, onSelect }: { current: Step; maxReachable: Step; onSelect: (s: Step) => void }) {
  const labels = messages.booking.steps;
  return (
    <nav aria-label={t("booking.stepLabel", { current, total: labels.length })}>
      <p className="sr-only" aria-live="polite">
        {t("booking.stepLabel", { current, total: labels.length })}: {labels[current - 1]}
      </p>
      <ol className="flex items-center gap-1.5 sm:gap-3">
        {labels.map((label, i) => {
          const step = (i + 1) as Step;
          const done = step < current;
          const active = step === current;
          const reachable = step <= maxReachable && !active;
          return (
            <li key={label} className="flex flex-1 items-center gap-1.5 sm:gap-3">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onSelect(step)}
                aria-current={active ? "step" : undefined}
                className="group flex flex-col items-center gap-1.5 disabled:cursor-default sm:flex-row"
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-full border text-sm font-semibold transition-colors",
                    active && "border-rose-deep bg-rose text-ink",
                    done && "border-primary bg-primary text-primary-foreground",
                    !active && !done && "border-input bg-white text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden /> : step}
                </span>
                <span className={cn("text-xs sm:text-sm", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
              </button>
              {i < labels.length - 1 && (
                <span aria-hidden className={cn("mb-5 h-px flex-1 sm:mb-0", done ? "bg-primary" : "bg-border")} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
