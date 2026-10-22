#!/usr/bin/env node
// Provisions an administrator account (customers never have accounts).
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   ADMIN_PASSWORD='<strong password>' node scripts/create-admin.mjs owner@example.com "اسم المالكة"
//
// Without ADMIN_PASSWORD a strong random password is generated and printed ONCE.
// Run it from a trusted machine; never commit or share the service-role key.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, displayName = "Owner"] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error("Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… [ADMIN_PASSWORD=…] node scripts/create-admin.mjs <email> [display name]");
  process.exit(1);
}
const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");
if (password.length < 12) {
  console.error("ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 });
let user = existing?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (user) {
  console.log(`User ${email} already exists — granting admin access only (password unchanged).`);
} else {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    console.error(`Could not create user: ${error.message}`);
    process.exit(1);
  }
  user = data.user;
  if (!process.env.ADMIN_PASSWORD) console.log(`Generated password (shown once, store it in a password manager): ${password}`);
}

const { error } = await db.from("admin_profiles").upsert({ user_id: user.id, display_name: displayName });
if (error) {
  console.error(`Could not grant admin access: ${error.message}`);
  process.exit(1);
}
console.log(`✔ ${email} is now an administrator.`);
