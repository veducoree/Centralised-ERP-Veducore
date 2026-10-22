/**
 * create-school — Veducore internal management edge function.
 *
 * Creates a new school record + admin auth user in one atomic operation.
 * Protected by a static management secret (VEDUCORE_MGMT_SECRET env var).
 *
 * POST /functions/v1/create-school
 * Headers:
 *   Authorization: Bearer <VEDUCORE_MGMT_SECRET>
 * Body:
 *   { name, address?, contact_number?, email, academic_year?,
 *     admin_name, admin_password }
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mgmtSecret = Deno.env.get("VEDUCORE_MGMT_SECRET") ?? "veducore-internal-2024";

    // Verify management secret
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token !== mgmtSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      name,
      address,
      contact_number,
      email,
      academic_year = "2025-2026",
      admin_name,
      admin_password,
    } = body;

    if (!name || !email || !admin_name || !admin_password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: name, email, admin_name, admin_password" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Create school record
    const { data: school, error: schoolErr } = await admin
      .from("schools")
      .insert({
        name,
        address: address ?? null,
        contact_number: contact_number ?? null,
        email,
        academic_year,
        timezone: "Asia/Kolkata",
        currency: "INR",
        currency_symbol: "₹",
      })
      .select()
      .maybeSingle();

    if (schoolErr || !school) {
      return new Response(
        JSON.stringify({ error: schoolErr?.message ?? "Failed to create school" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const schoolId: string = school.id;

    // 2. Create admin auth user
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: admin_password,
      email_confirm: true,
      user_metadata: { full_name: admin_name },
      app_metadata: { role: "admin", school_id: schoolId },
    });

    if (authErr || !authUser?.user) {
      // Rollback school
      await admin.from("schools").delete().eq("id", schoolId);
      return new Response(
        JSON.stringify({ error: authErr?.message ?? "Failed to create admin user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId: string = authUser.user.id;

    // 3. Upsert profile (trigger may have already created it)
    await admin.from("profiles").upsert({
      id: userId,
      school_id: schoolId,
      role: "admin",
      full_name: admin_name,
      email,
      status: "active",
    }, { onConflict: "id" });

    // 4. Audit log
    await admin.from("audit_logs").insert({
      school_id: schoolId,
      user_id: userId,
      action: "school_created",
      entity_type: "school",
      entity_id: schoolId,
      metadata: { name, email, admin_name },
    });

    return new Response(
      JSON.stringify({
        school_id: schoolId,
        admin_user_id: userId,
        school_name: name,
        admin_email: email,
        message: "School and admin account created successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
