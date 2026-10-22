import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "flex w-full rounded-2xl border border-input bg-white text-base shadow-sm transition-colors placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(field, "h-12 px-4", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(field, "min-h-[96px] px-4 py-3", className)} {...props} />,
);
Textarea.displayName = "Textarea";

/** Native select: best experience on phones (system picker). */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(field, "h-12 px-4", className)} {...props} />,
);
NativeSelect.displayName = "NativeSelect";

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} type="checkbox" className={cn("size-5 shrink-0 cursor-pointer accent-ink", className)} {...props} />
  ),
);
Checkbox.displayName = "Checkbox";
