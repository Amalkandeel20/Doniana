import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export default function NotFoundPage() {
  return (
    <section className="container flex flex-col items-center py-24 text-center">
      <p className="font-display text-6xl text-champagne-deep">404</p>
      <Button asChild className="mt-8">
        <Link to="/">{t("nav.home")}</Link>
      </Button>
    </section>
  );
}
