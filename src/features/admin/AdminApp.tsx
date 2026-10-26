import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Spinner } from "@/components/ui/spinner";
import { t } from "@/i18n";
import { AdminLayout } from "./AdminLayout";
import { AdminLogin } from "./AdminLogin";
import { useAdminSession } from "./useAdminSession";

const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const AppointmentsPage = lazy(() => import("./pages/AppointmentsPage"));
const AvailabilityPage = lazy(() => import("./pages/AvailabilityPage"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const RevenuePage = lazy(() => import("./pages/RevenuePage"));

export default function AdminApp() {
  const session = useAdminSession();

  if (session.status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label={t("admin.checking")} />
      </div>
    );
  }
  if (session.status !== "admin") return <AdminLogin notAdmin={session.status === "not-admin"} />;

  const page = (el: React.ReactNode) => <Suspense fallback={<Spinner className="mt-10" />}>{el}</Suspense>;

  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={page(<CalendarPage />)} />
        <Route path="appointments" element={page(<AppointmentsPage />)} />
        <Route path="availability" element={page(<AvailabilityPage />)} />
        <Route path="services" element={page(<ServicesPage />)} />
        <Route path="portfolio" element={page(<PortfolioPage />)} />
        <Route path="notifications" element={page(<NotificationsPage />)} />
        <Route path="settings" element={page(<SettingsPage />)} />
        <Route path="revenue" element={page(<RevenuePage />)} />
        <Route path="*" element={page(<CalendarPage />)} />
      </Route>
    </Routes>
  );
}
