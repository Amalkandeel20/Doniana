import { resetSchedule, serviceDb } from "./support/db";

/** Prepares the local database and the admin test accounts before the suite. */
export default async function globalSetup() {
  await resetSchedule();
  const db = serviceDb();
  const accounts = [
    { email: process.env.E2E_ADMIN_EMAIL ?? "owner@doniana.test", password: process.env.E2E_ADMIN_PASSWORD ?? "e2e-Owner-Password-1", admin: true },
    { email: "not-admin@doniana.test", password: "e2e-Not-Admin-Password-1", admin: false },
  ];
  for (const account of accounts) {
    const { data: list } = await db.auth.admin.listUsers();
    let user = list.users.find((u) => u.email === account.email);
    if (!user) {
      const created = await db.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
      if (created.error) throw created.error;
      user = created.data.user!;
    }
    if (account.admin) {
      await db.from("admin_profiles").upsert({ user_id: user.id, display_name: "E2E Owner" });
    }
  }
}
