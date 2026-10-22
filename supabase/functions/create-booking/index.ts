import { handleCreateBooking } from "../_shared/handlers.ts";
import { endpoint } from "../_shared/http.ts";
import { deps, env } from "../_shared/deno/runtime.ts";

const d = deps();
Deno.serve(endpoint(env, async (body, req) => handleCreateBooking(body, req, d)));
