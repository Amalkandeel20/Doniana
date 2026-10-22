import { handleAdminCreate, requireAdminUser } from "../_shared/handlers.ts";
import { endpoint } from "../_shared/http.ts";
import { deps, env, userClient } from "../_shared/deno/runtime.ts";

const d = deps();
Deno.serve(
  endpoint(env, async (body, req) => {
    const adminId = await requireAdminUser(req, d, userClient);
    return handleAdminCreate(body, adminId, d);
  }),
);
