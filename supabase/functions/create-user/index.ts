import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateUserBody {
  email: string;
  password: string;
  full_name: string;
  role: "teacher" | "parent";
  school_id: string;
  phone?: string;
  extra?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client with service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create user client to verify the caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller is admin
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role, school_id, status")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin" || profile.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: CreateUserBody = await req.json();
    const { email, password, full_name, role, school_id, phone, extra } = body;

    if (!email || !password || !full_name || !role || !school_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (school_id !== profile.school_id) {
      return new Response(
        JSON.stringify({ error: "Cannot create users for another school" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user with service role
    const { data: newAuthUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
      app_metadata: { role, school_id },
    });

    if (createErr) {
      return new Response(
        JSON.stringify({ error: createErr.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = newAuthUser.user.id;

    // Update the profile that was auto-created by the trigger
    const { error: profileErr } = await adminClient
      .from("profiles")
      .update({
        role,
        school_id,
        full_name,
        email,
        phone: phone || null,
        status: "active",
      })
      .eq("id", newUserId);

    if (profileErr) {
      // Best effort — the auth user is created, profile may have been auto-created
      console.error("Profile update error:", profileErr);
    }

    // Create role-specific record
    if (role === "teacher") {
      const { error: teacherErr } = await adminClient.from("teachers").insert({
        user_id: newUserId,
        school_id,
        full_name,
        email,
        phone: phone || null,
        employee_id: extra?.employee_id || `EMP-${Date.now()}`,
        qualification: extra?.qualification || null,
        subject: extra?.subject || null,
        date_of_joining: extra?.date_of_joining || new Date().toISOString().split("T")[0],
        status: "active",
      });
      if (teacherErr) {
        console.error("Teacher insert error:", teacherErr);
      }
    } else if (role === "parent") {
      const { error: parentErr } = await adminClient.from("parents").insert({
        user_id: newUserId,
        school_id,
        full_name,
        email,
        phone: phone || null,
        occupation: extra?.occupation || null,
        address: extra?.address || null,
        status: "active",
      });
      if (parentErr) {
        console.error("Parent insert error:", parentErr);
      }
    }

    // Audit log
    await adminClient.from("audit_logs").insert({
      school_id,
      user_id: userData.user.id,
      action: `${role}_created`,
      entity_type: "user",
      entity_id: newUserId,
      metadata: { email, full_name },
    });

    return new Response(
      JSON.stringify({ id: newUserId, email, message: `${role} account created successfully` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
