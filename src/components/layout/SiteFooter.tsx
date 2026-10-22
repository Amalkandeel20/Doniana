import { Link } from "react-router-dom";
import { t } from "@/i18n";

export function SiteFooter({ businessName = "DONIANA" }: { businessName?: string }) {
  return (
    <footer className="bg-black py-10 text-ivory/70">
      <div className="container flex flex-col items-center gap-3 text-center text-sm">
        <p className="font-display text-2xl tracking-brand text-ivory">{businessName}</p>
        <p className="font-display text-xs uppercase tracking-[0.25em] text-champagne">{t("brand.tagline")}</p>
        <p className="mt-2">
          © {new Date().getFullYear()} {businessName} · {t("footer.rights")}
        </p>
        <Link to="/admin" className="text-xs text-ivory/40 underline-offset-4 hover:text-ivory/70 hover:underline">
          {t("footer.admin")}
        </Link>
      </div>
    </footer>
  );
}
