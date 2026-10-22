import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Spinner } from "@/components/ui/spinner";
import HomePage from "@/pages/HomePage";

// Customer pages beyond the landing page and the whole admin area are code-split, so the first
// load on a phone stays small. FullCalendar only ever loads for the owner.
const BookCategoryPage = lazy(() => import("@/pages/BookCategoryPage"));
const BookFlowPage = lazy(() => import("@/pages/BookFlowPage"));
const ManageAppointmentPage = lazy(() => import("@/pages/ManageAppointmentPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));
const AdminApp = lazy(() => import("@/features/admin/AdminApp"));

const fallback = (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Spinner />
  </div>
);

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/book", element: <Suspense fallback={fallback}><BookCategoryPage /></Suspense> },
      { path: "/book/:category", element: <Suspense fallback={fallback}><BookFlowPage /></Suspense> },
      { path: "/a", element: <Suspense fallback={fallback}><ManageAppointmentPage /></Suspense> },
      { path: "*", element: <Suspense fallback={fallback}><NotFoundPage /></Suspense> },
    ],
  },
  { path: "/admin/*", element: <Suspense fallback={fallback}><AdminApp /></Suspense> },
]);

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-center" dir="rtl" richColors closeButton toastOptions={{ className: "font-sans" }} />
    </>
  );
}
