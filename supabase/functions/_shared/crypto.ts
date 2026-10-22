// Web Crypto helpers (identical in Deno, browsers and Node ≥ 20).

const encoder = new TextEncoder();

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/**
 * Management-link token. Derived from the booking's random idempotency key (UUID v4, 122 bits)
 * and a server secret, so the database never stores a usable token: only sha256(token) is kept.
 * The notification worker can rebuild the link for SMS without the plaintext being persisted.
 */
export async function deriveManageToken(secret: string, idempotencyKey: string): Promise<string> {
  if (secret.length < 32) throw new Error("MANAGE_TOKEN_SECRET must be at least 32 characters");
  return base64Url(await hmacSha256(secret, `manage-link:v1:${idempotencyKey}`));
}

export async function manageTokenHash(token: string): Promise<string> {
  return sha256Hex(token);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
