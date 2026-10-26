import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { t } from "@/i18n";
import { formatShekels } from "@/lib/format";
import { placeholders } from "@/lib/placeholders";
import { cn } from "@/lib/utils";
import type { ServiceCategory } from "@/types/models";

// Brows cards are tinted sage, piercing cards dusty rose, as in the brand mock-up.
const TINT: Record<ServiceCategory, { overlay: string; text: string; sub: string; arrow: string }> = {
  brows: {
    overlay: "from-sage/95 via-sage/75 to-sage/0",
    text: "text-cream",
    sub: "text-cream/85",
    arrow: "border-cream/70 text-cream group-hover:bg-cream group-hover:text-sage",
  },
  piercing: {
    overlay: "from-rose/95 via-rose/75 to-rose/0",
    text: "text-ink",
    sub: "text-ink/75",
    arrow: "border-ink/50 text-ink group-hover:bg-ink group-hover:text-rose",
  },
};

export function CategoryCard({
  category,
  fromPriceAgorot,
  imageUrl,
  to,
}: {
  category: ServiceCategory;
  fromPriceAgorot?: number;
  imageUrl?: string | null;
  to: string;
}) {
  const tint = TINT[category];
  return (
    <Link
      to={to}
      data-testid={`category-${category}`}
      className="group relative isolate block min-h-[9.5rem] overflow-hidden rounded-3xl shadow-sm ring-1 ring-ink/5 transition-transform duration-300 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[11rem]"
    >
      {/* photo sits on the end side; the tint fades it in from the text side */}
      <img
        src={imageUrl ?? placeholders.category[category]}
        alt=""
        loading="lazy"
        width={1200}
        height={900}
        className="absolute inset-y-0 end-0 -z-10 h-full w-[70%] object-cover transition-transform duration-700 group-hover:scale-[1.03]"
      />
      <div className={cn("absolute inset-0 -z-10 bg-gradient-to-l", tint.overlay)} />
      <div className="flex h-full min-h-[inherit] items-center justify-between gap-4 p-5 sm:p-7">
        <div>
          <h3 className={cn("font-heading text-3xl leading-snug sm:text-4xl", tint.text)}>{t(`categories.${category}.ar`)}</h3>
          <p className={cn("mt-1 text-sm", tint.sub)}>{t(`categories.${category}.sub`)}</p>
          {fromPriceAgorot !== undefined && (
            <p className={cn("mt-1 text-xs", tint.sub)}>
              {t("home.from")} {formatShekels(fromPriceAgorot)}
            </p>
          )}
        </div>
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-full border transition-colors", tint.arrow)}>
          <ArrowLeft className="size-5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
