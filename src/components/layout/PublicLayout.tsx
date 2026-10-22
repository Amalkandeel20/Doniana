import { Outlet } from "react-router-dom";
import { isConfigured } from "@/lib/config";
import { t } from "@/i18n";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ivory focus:px-4 focus:py-2">
        تخطي إلى المحتوى
      </a>
      <SiteHeader />
      {!isConfigured && (
        <div role="alert" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
          {t("common.notConfigured")}
        </div>
      )}
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
