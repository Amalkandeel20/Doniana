import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError, Label } from "@/components/ui/label";
import { t } from "@/i18n";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export function AdminLogin({ notAdmin }: { notAdmin?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  // The form stays mounted when a sign-in resolves to a non-admin account, so derive this message.
  const message = error ?? (notAdmin ? t("admin.login.notAdmin") : null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      const invalid = authError.code === "invalid_credentials" || authError.status === 400;
      setError(invalid ? t("admin.login.invalid") : t("admin.login.error"));
    }
  });

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo tone="dark" className="h-36" priority />
      <form onSubmit={onSubmit} noValidate className="mt-8 w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card p-6 shadow-lg" aria-labelledby="login-title">
        <div>
          <h1 id="login-title" className="font-heading text-3xl">
            {t("admin.login.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.login.text")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("admin.login.email")}</Label>
          <Input id="email" type="email" dir="ltr" autoComplete="username" aria-invalid={!!formState.errors.email} {...register("email")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("admin.login.password")}</Label>
          <Input id="password" type="password" dir="ltr" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register("password")} />
        </div>
        <FieldError message={message ?? undefined} />
        <Button type="submit" className="w-full" disabled={formState.isSubmitting} data-testid="admin-login-submit">
          {formState.isSubmitting ? t("admin.login.submitting") : t("admin.login.submit")}
        </Button>
        {notAdmin && (
          <Button type="button" variant="ghost" className="w-full" onClick={() => supabase.auth.signOut()}>
            {t("admin.nav.signOut")}
          </Button>
        )}
      </form>
    </div>
  );
}
