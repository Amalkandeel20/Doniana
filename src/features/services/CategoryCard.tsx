import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { t } from "@/i18n";
import { formatShekels } from "@/lib/format";
import { placeholders } from "@/lib/placeholders";
import type { ServiceCategory } from "@/types/models";

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
  const names = t(`categories.${category}.ar`);
  const en = t(`categories.${category}.en`);
  return (
    <Link
      to={to}
      data-testid={`category-${category}`}
      className="group relative isolate block overflow-hidden rounded-3xl bg-ink text-ivory shadow-sm ring-1 ring-black/5 transition-transform duration-300 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img
        src={imageUrl ?? placeholders.category[category]}
        alt=""
        loading="lazy"
        width={1200}
        height={900}
        className="aspect-[4/3] w-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-[1.03] sm:aspect-[5/4]"
      />
      <div className="absolute inset-0 -z-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-7">
        <div>
          <p className="font-display text-sm uppercase tracking-brand text-champagne">{en}</p>
          <h3 className="mt-1 text-2xl font-semibold sm:text-3xl">{names}</h3>
          {fromPriceAgorot !== undefined && (
            <p className="mt-1 text-sm text-ivory/80">
              {t("home.from")} {formatShekels(fromPriceAgorot)}
            </p>
          )}
        </div>
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ivory text-ink transition-transform group-hover:-translate-x-1">
          <ArrowLeft className="size-5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
