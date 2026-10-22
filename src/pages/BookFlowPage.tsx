import { useEffect, useRef } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { BookingProvider, useBooking } from "@/features/booking/BookingContext";
import { maxReachableStep, type Step } from "@/features/booking/bookingState";
import { StepIndicator } from "@/features/booking/StepIndicator";
import { SuccessView } from "@/features/booking/SuccessView";
import { DateTimeStep } from "@/features/booking/steps/DateTimeStep";
import { DETAILS_FORM_ID, DetailsStep } from "@/features/booking/steps/DetailsStep";
import { ReviewStep } from "@/features/booking/steps/ReviewStep";
import { ServiceStep } from "@/features/booking/steps/ServiceStep";
import { fetchCatalog } from "@/features/services/publicData";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import type { BookingResponse, ServiceCategory } from "@/types/models";

// The confirmation lives in this history entry's state: a reload shows it again, but a fresh visit
// to the booking page always starts a new booking.
interface FlowLocationState {
  bookingResult?: BookingResponse;
}

export default function BookFlowPage() {
  const { category } = useParams();
  if (category !== "brows" && category !== "piercing") return <Navigate to="/book" replace />;
  return (
    <BookingProvider>
      <Flow category={category} />
    </BookingProvider>
  );
}

function Flow({ category }: { category: ServiceCategory }) {
  const { state, dispatch } = useBooking();
  const catalog = useAsync(() => fetchCatalog(), []);
  const location = useLocation();
  const navigate = useNavigate();
  const result = (location.state as FlowLocationState | null)?.bookingResult ?? null;
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dispatch({ type: "setCategory", category });
  }, [category, dispatch]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state.step, result]);

  const services = (catalog.data ?? []).filter((s) => s.category === category);
  const service = services.find((s) => s.id === state.serviceId);
  const maxStep = maxReachableStep(state, service?.location_required ?? false);
  const step: Step = Math.min(state.step, maxStep) as Step;

  const goTo = (s: Step) => dispatch({ type: "goTo", step: s });

  const onBooked = (r: BookingResponse) => {
    navigate(location.pathname, { replace: true, state: { bookingResult: r } satisfies FlowLocationState });
    dispatch({ type: "reset", category });
  };

  if (result) {
    return (
      <div ref={topRef} className="container max-w-3xl scroll-mt-24 py-10">
        <SuccessView
          result={result}
          onBookAnother={() => navigate(location.pathname, { replace: true, state: null })}
        />
      </div>
    );
  }

  const canContinue = step < maxStep;

  return (
    <div ref={topRef} className="container max-w-3xl scroll-mt-24 pb-36 pt-6 sm:pt-10">
      <div className="mb-6 flex items-center justify-between">
        <p className="font-display text-sm uppercase tracking-brand text-champagne-deep" lang="en">
          {t(`categories.${category}.en`)}
        </p>
        <Link to="/book" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {t("booking.changeCategory")}
        </Link>
      </div>
      <StepIndicator current={step} maxReachable={maxStep} onSelect={goTo} />

      <div className="mt-8 animate-fade-up" key={step}>
        {catalog.loading && !catalog.data ? (
          <Spinner label={t("common.loading")} className="py-10" />
        ) : catalog.error !== undefined ? (
          <div role="alert" className="rounded-3xl bg-destructive/5 p-5">
            <p>{t("booking.errors.network")}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={catalog.reload}>
              {t("common.retry")}
            </Button>
          </div>
        ) : step === 1 ? (
          <ServiceStep services={services} />
        ) : step === 2 ? (
          <DateTimeStep />
        ) : step === 3 ? (
          <DetailsStep onDone={() => goTo(4)} />
        ) : service ? (
          <ReviewStep service={service} onBooked={onBooked} />
        ) : null}
      </div>

      {/* Sticky, thumb-friendly navigation */}
      {step < 4 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="container flex max-w-3xl items-center gap-3 py-3">
            {step > 1 && (
              <Button variant="outline" onClick={() => goTo((step - 1) as Step)} data-testid="step-back">
                <ArrowRight aria-hidden /> {t("booking.back")}
              </Button>
            )}
            {step === 3 ? (
              <Button type="submit" form={DETAILS_FORM_ID} className="flex-1" data-testid="step-next">
                {t("booking.next")} <ArrowLeft aria-hidden />
              </Button>
            ) : (
              <Button className="flex-1" disabled={!canContinue} onClick={() => goTo((step + 1) as Step)} data-testid="step-next">
                {t("booking.next")} <ArrowLeft aria-hidden />
              </Button>
            )}
          </div>
        </div>
      )}
      {step === 4 && (
        <div className="mt-4">
          <Button variant="outline" onClick={() => goTo(3)} data-testid="step-back">
            <ArrowRight aria-hidden /> {t("booking.back")}
          </Button>
        </div>
      )}
    </div>
  );
}
