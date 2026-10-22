import { NavLink, Outlet, Link } from "react-router-dom";
import { Bell, CalendarDays, Clock, ExternalLink, Images, ListChecks, LogOut, Settings, Sparkles } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { t } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const adminNav = [
  { to: "/admin", end: true, label: t("admin.nav.calendar"), icon: CalendarDays, mobile: true },
  { to: "/admin/appointments", label: t("admin.nav.appointments"), icon: ListChecks, mobile: true },
  { to: "/admin/availability", label: t("admin.nav.availability"), icon: Clock, mobile: true },
  { to: "/admin/services", label: t("admin.nav.services"), icon: Sparkles, mobile: true },
  { to: "/admin/portfolio", label: t("admin.nav.portfolio"), icon: Images, mobile: false },
  { to: "/admin/notifications", label: t("admin.nav.notifications"), icon: Bell, mobile: false },
  { to: "/admin/settings", label: t("admin.nav.settings"), icon: Settings, mobile: true },
];

export function AdminLayout() {
  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-black p-4 text-ivory md:flex">
        <Link to="/admin" className="mx-auto">
          <Logo className="h-24" />
        </Link>
        <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label={t("admin.title")}>
          {adminNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn("flex items-center gap-3 rounded-2xl px-4 py-3 text-ivory/75 transition-colors hover:bg-white/10 hover:text-ivory", isActive && "bg-white/10 text-ivory")
              }
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col gap-1 border-t border-white/10 pt-3 text-sm">
          <a href="/" target="_blank" rel="noopener" className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-ivory/60 hover:bg-white/10">
            <ExternalLink className="size-4" aria-hidden /> {t("admin.nav.viewSite")}
          </a>
          <button type="button" onClick={() => supabase.auth.signOut()} className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-ivory/60 hover:bg-white/10" data-testid="admin-signout">
            <LogOut className="size-4" aria-hidden /> {t("admin.nav.signOut")}
          </button>
        </div>
      </aside>

      {/* Phone header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-black px-4 text-ivory md:hidden">
        <Link to="/admin">
          <Logo className="h-12" />
        </Link>
        <div className="flex items-center gap-1">
          <NavLink to="/admin/notifications" className="rounded-full p-2.5 hover:bg-white/10" aria-label={t("admin.nav.notifications")}>
            <Bell className="size-5" />
          </NavLink>
          <NavLink to="/admin/portfolio" className="rounded-full p-2.5 hover:bg-white/10" aria-label={t("admin.nav.portfolio")}>
            <Images className="size-5" />
          </NavLink>
          <button type="button" onClick={() => supabase.auth.signOut()} className="rounded-full p-2.5 hover:bg-white/10" aria-label={t("admin.nav.signOut")}>
            <LogOut className="size-5" />
          </button>
        </div>
      </header>

      <main className="min-w-0 px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8 lg:px-10">
        <Outlet />
      </main>

      {/* Phone bottom navigation: large touch targets */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label={t("admin.title")}>
        {adminNav
          .filter((i) => i.mobile)
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn("flex flex-col items-center gap-1 py-2.5 text-[0.7rem] text-muted-foreground", isActive && "font-semibold text-foreground")}
            >
              <item.icon className="size-6" aria-hidden />
              {item.label}
            </NavLink>
          ))}
      </nav>
    </div>
  );
}
