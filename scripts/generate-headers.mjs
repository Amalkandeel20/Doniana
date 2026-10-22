// Writes dist/_headers (Cloudflare static-asset headers) with a Content-Security-Policy that only
// allows this site, the environment's Supabase project and (optionally) Cloudflare Turnstile.
import { existsSync, writeFileSync } from "node:fs";
import { loadEnv } from "vite";

const mode = process.env.MODE ?? process.env.NODE_ENV ?? "production";
const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
const supabase = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : "";
const turnstile = env.VITE_TURNSTILE_SITE_KEY ? "https://challenges.cloudflare.com" : "";
const supabaseWs = supabase.replace(/^http/, "ws");

const csp = [
  "default-src 'self'",
  `script-src 'self' ${turnstile}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${supabase} ${supabaseWs}`.trim(),
  `frame-src ${turnstile || "'none'"}`,
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const headers = `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin

/a
  Referrer-Policy: no-referrer
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow

/admin*
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;

if (!existsSync("dist")) throw new Error("dist/ not found — run vite build first");
writeFileSync("dist/_headers", headers);
console.log(`dist/_headers written (supabase: ${supabase || "not set"})`);
