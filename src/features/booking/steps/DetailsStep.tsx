import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError, Label } from "@/components/ui/label";
import { t } from "@/i18n";
import { customerDetailsSchema, type CustomerDetails } from "@shared/domain/schemas.ts";
import { useBooking } from "../BookingContext";

export const DETAILS_FORM_ID = "booking-details-form";

export function DetailsStep({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useBooking();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerDetails>({
    resolver: zodResolver(customerDetailsSchema),
    defaultValues: { customerName: state.customerName, customerPhone: state.customerPhone },
    mode: "onTouched",
  });

  const onSubmit = handleSubmit((values) => {
    dispatch({ type: "setDetails", customerName: values.customerName.trim(), customerPhone: values.customerPhone.trim() });
    onDone();
  });

  const msg = (key?: string) => (key ? t(key) : undefined);

  return (
    <form id={DETAILS_FORM_ID} noValidate onSubmit={onSubmit} className="space-y-6">
      <div>
        <h2 className="font-heading text-3xl">{t("booking.details.title")}</h2>
        <p className="mt-1 text-muted-foreground">{t("booking.details.text")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="customerName">{t("booking.details.name")}</Label>
        <Input
          id="customerName"
          autoComplete="name"
          enterKeyHint="next"
          placeholder={t("booking.details.namePlaceholder")}
          aria-invalid={!!errors.customerName}
          aria-describedby={errors.customerName ? "customerName-error" : undefined}
          {...register("customerName")}
        />
        <FieldError id="customerName-error" message={msg(errors.customerName?.message)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="customerPhone">{t("booking.details.phone")}</Label>
        <Input
          id="customerPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          enterKeyHint="done"
          placeholder={t("booking.details.phonePlaceholder")}
          className="text-end placeholder:text-end"
          aria-invalid={!!errors.customerPhone}
          aria-describedby={errors.customerPhone ? "customerPhone-error" : "customerPhone-hint"}
          {...register("customerPhone")}
        />
        <p id="customerPhone-hint" className="text-sm text-muted-foreground">
          {t("booking.details.phoneHint")}
        </p>
        <FieldError id="customerPhone-error" message={msg(errors.customerPhone?.message)} />
      </div>
      <p className="text-xs text-muted-foreground">{t("booking.details.privacy")}</p>
      <Button type="submit" className="sr-only">
        {t("booking.next")}
      </Button>
    </form>
  );
}
