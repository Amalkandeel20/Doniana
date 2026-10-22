import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-secondary text-secondary-foreground",
      confirmed: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
      cancelled: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
      completed: "bg-stone-100 text-stone-700 ring-1 ring-stone-200",
      warning: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
      dark: "bg-ink text-ivory",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
