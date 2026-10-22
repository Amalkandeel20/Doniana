import { CategoryCard } from "@/features/services/CategoryCard";
import { t } from "@/i18n";

export default function BookCategoryPage() {
  return (
    <section className="container max-w-3xl py-10 sm:py-16">
      <div className="text-center">
        <p className="eyebrow-label">Book Now</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{t("categories.chooseTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("categories.chooseText")}</p>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <CategoryCard category="brows" to="/book/brows" />
        <CategoryCard category="piercing" to="/book/piercing" />
      </div>
    </section>
  );
}
