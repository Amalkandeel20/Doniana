import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {label ? <span>{label}</span> : <span className="sr-only">…</span>}
    </span>
  );
}
