// Public, build-time configuration. Only publishable values may appear here.
export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  turnstileSiteKey: (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || undefined,
  appEnv: (import.meta.env.VITE_APP_ENV as string | undefined) ?? "development",
};

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
