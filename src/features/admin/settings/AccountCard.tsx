// The signed-in admin's own login email and password (changed through the admin-account function).
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { ApiError, callFunction } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Field, LoadState, Section } from "./common";
import { fieldAria } from "./data";

const K = "admin.settings.settings.account";

const schema = z
  .object({
    newEmail: z.union([z.literal(""), z.string().trim().email(t("admin.settings.v.email"))]),
    newPassword: z.union([z.literal(""), z.string().min(10, t(`${K}.tooShort`))]),
    confirmPassword: z.string(),
    currentPassword: z.string().min(1, t("admin.settings.v.required")),
  })
  .refine((v) => v.newEmail !== "" || v.newPassword !== "", { path: ["newEmail"], message: t(`${K}.nothing`) })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: t(`${K}.mismatch`) });
type Values = z.infer<typeof schema>;

const EMPTY: Values = { newEmail: "", newPassword: "", confirmPassword: "", currentPassword: "" };

const fetchEmail = async () => (await supabase.auth.getUser()).data.user?.email ?? "";

export function AccountCard() {
  const { data: email, loading, error, reload } = useAsync(fetchEmail, []);
  return (
    <Section title={t(`${K}.title`)} text={t(`${K}.text`)}>
      {email !== undefined ? <AccountForm email={email} onSaved={reload} /> : <LoadState loading={loading} error={error} onRetry={reload} />}
    </Section>
  );
}

function AccountForm({ email, onSaved }: { email: string; onSaved: () => void }) {
  const { register, handleSubmit, reset, setError, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const e = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    try {
      await callFunction(
        "admin-account",
        { currentPassword: v.currentPassword, newEmail: v.newEmail || undefined, newPassword: v.newPassword || undefined },
        { auth: true },
      );
      await supabase.auth.refreshSession();
      reset(EMPTY);
      toast.success(t(`${K}.saved`));
      onSaved();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (code === "wrong_password") setError("currentPassword", { message: t(`${K}.wrongPassword`) });
      else if (code === "email_taken") setError("newEmail", { message: t(`${K}.emailTaken`) });
      else toast.error(t(`${K}.error`));
    }
  });

  const field = (name: keyof Values, label: string, type: string, autoComplete: string, help?: string) => {
    const id = `account-${name}`;
    return (
      <Field id={id} label={label} help={help} error={e[name]?.message}>
        <Input type={type} dir="ltr" autoComplete={autoComplete} {...fieldAria(id, e[name]?.message, !!help)} {...register(name)} />
      </Field>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-testid="account-form">
      <p className="text-sm">
        {t(`${K}.currentEmail`)}:{" "}
        <bdi dir="ltr" className="font-medium">
          {email}
        </bdi>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("newEmail", t(`${K}.newEmail`), "email", "email", t(`${K}.newEmailHelp`))}
        <div className="hidden sm:block" />
        {field("newPassword", t(`${K}.newPassword`), "password", "new-password", t(`${K}.newPasswordHelp`))}
        {field("confirmPassword", t(`${K}.confirmPassword`), "password", "new-password")}
        {field("currentPassword", t(`${K}.currentPassword`), "password", "current-password", t(`${K}.currentPasswordHelp`))}
      </div>
      <Button type="submit" disabled={formState.isSubmitting} className="w-full sm:w-auto">
        {formState.isSubmitting ? t("admin.settings.common.saving") : t(`${K}.submit`)}
      </Button>
    </form>
  );
}
