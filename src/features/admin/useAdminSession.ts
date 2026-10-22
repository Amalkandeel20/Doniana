import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type AdminSessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "not-admin"; session: Session }
  | { status: "admin"; session: Session };

async function isAdmin(session: Session): Promise<boolean> {
  // RLS only returns the caller's own admin_profiles row, if any.
  const { data, error } = await supabase.from("admin_profiles").select("user_id").eq("user_id", session.user.id).maybeSingle();
  return !error && !!data;
}

/** Client-side gate for the admin UI. Real enforcement is RLS + is_admin() checks in SQL. */
export function useAdminSession(): AdminSessionState {
  const [state, setState] = useState<AdminSessionState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const resolve = async (session: Session | null) => {
      if (!session) return active && setState({ status: "signed-out" });
      const admin = await isAdmin(session);
      if (active) setState(admin ? { status: "admin", session } : { status: "not-admin", session });
    };
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void resolve(session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
