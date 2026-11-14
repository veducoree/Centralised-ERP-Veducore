/**
 * mgmt-auth — first-time setup for the Veducore management portal.
 *
 * POST { action: "check" }                         → { is_setup_done }
 * POST { action: "setup", email, password, full_name }
 *      Creates the first Veducore owner. Refused once any team member
 *      exists; later members are added from the portal's Team page.
 *
 * Sign-in itself happens in the browser with Supabase Auth; every
 * portal request is then verified by manage-schools against
 * veducore_admins.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const action = body.action ?? "check";

  const { count } = await admin.from("veducore_admins").select("id", { count: "exact", head: true });
  const isSetupDone = (count ?? 0) > 0;

  if (action === "check") return json({ is_setup_done: isSetupDone });

  if (action === "setup") {
    if (isSetupDone) return json({ error: "Setup is already complete. Please sign in." }, 409);

    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const fullName = (body.full_name ?? "").trim();
    if (!email || !password || !fullName) return json({ error: "Name, email and password are required" }, 400);
    if (password.length < 10) return json({ error: "Password must be at least 10 characters" }, 400);

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (authErr || !authData?.user) return json({ error: authErr?.message ?? "Failed to create account" }, 400);

    const { error: insertErr } = await admin.from("veducore_admins").insert({
      id: authData.user.id,
      email,
      full_name: fullName,
      role: "owner",
      status: "active",
    });
    if (insertErr) {
      await admin.auth.admin.deleteUser(authData.user.id);
      return json({ error: insertErr.message }, 500);
    }

    await admin.from("platform_audit_log").insert({
      actor_id: authData.user.id,
      actor_name: fullName,
      actor_email: email,
      action: "team.setup",
      details: {},
    });
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
});
