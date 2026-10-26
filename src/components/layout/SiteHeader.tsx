import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { AtSign, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchBusinessInfo } from "@/features/services/publicData";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

const links = [
  { href: "/#services", label: t("nav.services") },
  { href: "/#gallery", label: t("nav.gallery") },
  { href: "/#contact", label: t("nav.contact") },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const info = useAsync(() => fetchBusinessInfo(), []);
  const instagram = info.data?.settings?.instagram_url ?? null;

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-cream/95 text-ink backdrop-blur">
      {/* Logo centred between the links (start) and the booking button (end), as in the brand mock-up */}
      <div className="container grid h-[4.5rem] grid-cols-[1fr_auto_1fr] items-center gap-4 sm:h-24">
        <div className="flex items-center gap-1 justify-self-start">
          <nav aria-label={t("nav.menu")} className="hidden items-center gap-7 md:flex">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="text-sm text-ink/75 transition-colors hover:text-ink">
                {l.label}
              </a>
            ))}
          </nav>
          {instagram && (
            <a
              href={instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("home.instagram")}
              className="rounded-full p-2.5 text-ink/80 hover:bg-ink/5 md:ms-4"
            >
              <AtSign className="size-5" />
            </a>
          )}
        </div>

        <Link to="/" aria-label="DONIANA" className="justify-self-center" onClick={() => setOpen(false)}>
          <Logo tone="dark" className="h-16 sm:h-20" priority />
        </Link>

        <div className="flex items-center gap-2 justify-self-end">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <NavLink to="/book">{t("nav.book")}</NavLink>
          </Button>
          <button
            type="button"
            className="rounded-full p-2.5 text-ink hover:bg-ink/5 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={t("nav.menu")}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        className={cn(
          "grid overflow-hidden border-t border-ink/10 transition-[grid-template-rows] duration-300 md:hidden",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr] border-transparent",
        )}
      >
        <nav className="min-h-0" aria-label={t("nav.menu")}>
          <div className="container flex flex-col gap-1 py-4">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-lg hover:bg-ink/5">
                {l.label}
              </a>
            ))}
            <Button asChild size="lg" className="mt-2">
              <Link to="/book" onClick={() => setOpen(false)}>
                {t("nav.book")}
              </Link>
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}
