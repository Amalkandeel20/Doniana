// Small building blocks shared by the availability/services/portfolio/notifications/settings pages.
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { FieldError, Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export function PageHeader({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-heading text-3xl">{title}</h1>
        {text && <p className="mt-1 max-w-2xl text-muted-foreground">{text}</p>}
      </div>
      {action}
    </div>
  );
}

export function Section({ title, text, children, className }: { title: string; text?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {text && <p className="text-sm text-muted-foreground">{text}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Label + control + help text + validation message, wired with ids for screen readers. */
export function Field({
  id,
  label,
  help,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  help?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {help && (
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {help}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Large, phone-friendly checkbox row (the whole row is the touch target). */
export const CheckboxRow = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; help?: string }
>(({ label, help, className, id, ...props }, ref) => (
  <label htmlFor={id} className={cn("flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border bg-white px-4 py-3", className)}>
    <Checkbox ref={ref} id={id} className="mt-0.5" {...props} />
    <span className="flex flex-col gap-0.5">
      <span className="font-medium">{label}</span>
      {help && <span className="text-sm text-muted-foreground">{help}</span>}
    </span>
  </label>
));
CheckboxRow.displayName = "CheckboxRow";

export function LoadState({ loading, error, onRetry }: { loading: boolean; error: unknown; onRetry: () => void }) {
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-rose-50 p-4">
        <p>{t("admin.settings.common.loadError")}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("admin.settings.common.retry")}
        </Button>
      </div>
    );
  }
  if (loading) return <Spinner className="py-6" label={t("admin.settings.common.loading")} />;
  return null;
}

export function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed p-5 text-center text-muted-foreground">{children}</p>;
}
