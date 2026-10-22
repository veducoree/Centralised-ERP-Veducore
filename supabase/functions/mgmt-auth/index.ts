/**
 * mgmt-auth — Veducore Management Portal authentication
 *
 * POST /functions/v1/mgmt-auth
 * Body (action = "check"):   {}
 * Body (action = "setup"):   { email, password, full_name }
 * Body (action = "login"):   { email, password }
 *
 * "check"  → returns { is_setup_done: boolean }
 * "setup"  → creates first-time admin, returns { token }
 * "login"  → verifies credentials, returns { token, full_name }
 *
 * No Authorization header needed for "check".
 * Uses Supabase Auth under the hood for password management.
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* empty body for "check" */ }

  const action = body.action ?? "check";

  // ── CHECK: is management account set up? ─────────────────────────────────
  if (action === "check") {
    const { count } = await admin
      .from("veducore_admins")
      .select("id", { count: "exact", head: true });
    return json({ is_setup_done: (count ?? 0) > 0 });
  }

  // ── SETUP: first-time account creation ───────────────────────────────────
  if (action === "setup") {
    const { email, password, full_name } = body;
    if (!email || !password || !full_name) {
      return json({ error: "email, password and full_name are required" }, 400);
    }
    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Ensure no admin exists yet (prevent re-setup)
    const { count } = await admin
      .from("veducore_admins")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) {
      return json({ error: "Management account already exists. Please login instead." }, 409);
    }

    // Create auth user
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (authErr || !authData?.user) {
      return json({ error: authErr?.message ?? "Failed to create account" }, 400);
    }

    // Insert into veducore_admins
    const { error: insertErr } = await admin.from("veducore_admins").insert({
      id: authData.user.id,
      email,
      full_name,
    });
    if (insertErr) {
      // Rollback auth user
      await admin.auth.admin.deleteUser(authData.user.id);
      return json({ error: insertErr.message }, 500);
    }

    // Sign in to get a token
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({ email, password });
    if (signInErr || !signInData?.session) {
      return json({ error: "Account created but auto-login failed. Please login manually." }, 200);
    }

    return json({
      token: signInData.session.access_token,
      full_name,
      message: "Management account created successfully",
    });
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (action === "login") {
    const { email, password } = body;
    if (!email || !password) {
      return json({ error: "Email and password are required" }, 400);
    }

    // Sign in via Supabase Auth
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({ email, password });
    if (signInErr || !signInData?.user) {
      return json({ error: "Invalid email or password" }, 401);
    }

    // Verify this user is actually a veducore admin
    const { data: adminRecord } = await admin
      .from("veducore_admins")
      .select("full_name")
      .eq("id", signInData.user.id)
      .maybeSingle();

    if (!adminRecord) {
      return json({ error: "This account is not a Veducore management admin" }, 403);
    }

    return json({
      token: signInData.session!.access_token,
      full_name: adminRecord.full_name,
    });
  }

  return json({ error: "Unknown action" }, 400);
});
