import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  return (
    <header className="sticky top-0 z-40 bg-black text-ivory">
      <div className="container flex h-16 items-center justify-between gap-4 sm:h-20">
        <Link to="/" aria-label="DONIANA" className="shrink-0" onClick={() => setOpen(false)}>
          <Logo className="ms-2 h-14 sm:ms-6 sm:h-[4.5rem]" priority />
        </Link>

        <nav aria-label={t("nav.menu")} className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-ivory/80 transition-colors hover:text-ivory">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="champagne" size="sm" className="hidden sm:inline-flex">
            <NavLink to="/book">{t("nav.book")}</NavLink>
          </Button>
          <button
            type="button"
            className="rounded-full p-2.5 text-ivory hover:bg-white/10 md:hidden"
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
          "grid overflow-hidden border-t border-white/10 transition-[grid-template-rows] duration-300 md:hidden",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr] border-transparent",
        )}
      >
        <nav className="min-h-0" aria-label={t("nav.menu")}>
          <div className="container flex flex-col gap-1 py-4">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-lg hover:bg-white/5">
                {l.label}
              </a>
            ))}
            <Button asChild variant="champagne" size="lg" className="mt-2">
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
