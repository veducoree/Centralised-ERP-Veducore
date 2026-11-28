import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateUserBody {
  /** "set_password": admin resets an existing teacher/parent login (needs user_id). */
  /** "update_parent_login": admin changes an existing parent's login mobile
   *  (email), name and/or password together (needs user_id). */
  action?: "create" | "set_password" | "update_parent_login";
  user_id?: string;
  email: string;
  password: string;
  full_name: string;
  role: "teacher" | "parent" | "admin";
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

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role, school_id, status, staff_role_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    const body: CreateUserBody = await req.json();
    const { action, user_id, email, password, full_name, role, school_id, phone, extra } = body;
    const isSetPassword = action === "set_password";
    const isUpdateParentLogin = action === "update_parent_login";
    const studentId = (extra?.student_id as string | undefined) ?? null;

    if (!profile || profile.role !== "admin" || profile.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const missing = isUpdateParentLogin
      ? (!user_id || !email || !full_name || !school_id)
      : isSetPassword
        ? (!user_id || !password || !role || !school_id)
        : (!email || !password || !full_name || !role || !school_id);
    if (missing) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["teacher", "parent", "admin"].includes(role)) {
      return new Response(
        JSON.stringify({ error: "Invalid role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Staff accounts: owner only. Teachers/parents: owner, or staff whose
    // role grants edit on that module.
    const isOwner = profile.staff_role_id === null;
    let staffRoleId: string | null = null;
    if (role === "admin") {
      if (!isOwner) {
        return new Response(
          JSON.stringify({ error: "Only the school owner can create staff logins" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      staffRoleId = (extra?.staff_role_id as string | undefined) ?? null;
      const { data: staffRole } = staffRoleId
        ? await adminClient.from("staff_roles").select("id").eq("id", staffRoleId).eq("school_id", profile.school_id).maybeSingle()
        : { data: null };
      if (!staffRole) {
        return new Response(
          JSON.stringify({ error: "Choose a valid staff role" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (!isOwner) {
      const { data: staffRole } = await adminClient
        .from("staff_roles").select("permissions").eq("id", profile.staff_role_id).maybeSingle();
      const perms = (staffRole?.permissions ?? {}) as Record<string, string>;
      const modules = role === "teacher" ? ["teachers"] : ["parents", "students", "admissions"];
      if (!modules.some((m) => perms[m] === "edit")) {
        return new Response(
          JSON.stringify({ error: `Your role cannot create ${role} accounts` }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (school_id !== profile.school_id) {
      return new Response(
        JSON.stringify({ error: "Cannot create users for another school" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Existing parent's details edited at admission: move the login to the new
    // mobile (auth email), new name and/or new password, keeping the parents
    // row, profile and stored password copy in step with Auth.
    if (isUpdateParentLogin) {
      if (password && password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: target } = await adminClient
        .from("parents").select("id, email").eq("user_id", user_id).eq("school_id", school_id).maybeSingle();
      if (!target) {
        return new Response(
          JSON.stringify({ error: "No parent login found in your school" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const newEmail = email.trim().toLowerCase();
      const emailChanged = newEmail !== String(target.email ?? "").toLowerCase();
      if (emailChanged) {
        const { data: taken } = await adminClient
          .from("profiles").select("id").ilike("email", newEmail).neq("id", user_id).maybeSingle();
        if (taken) {
          return new Response(
            JSON.stringify({ error: "This mobile number is already used by another login" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      const { error: authErr } = await adminClient.auth.admin.updateUserById(user_id!, {
        ...(emailChanged ? { email: newEmail, email_confirm: true } : {}),
        ...(password ? { password } : {}),
        user_metadata: { full_name },
      });
      if (authErr) {
        return new Response(
          JSON.stringify({ error: /already/i.test(authErr.message) ? "This mobile number is already used by another login" : authErr.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await adminClient.from("profiles").update({
        full_name, email: newEmail, phone: phone || null,
      }).eq("id", user_id);
      const { error: parentErr } = await adminClient.from("parents").update({
        full_name, email: newEmail, phone: phone || null,
        ...(extra?.address ? { address: extra.address } : {}),
        ...(password ? { password } : {}),
      }).eq("id", target.id);
      if (parentErr) {
        return new Response(
          JSON.stringify({ error: "Login updated, but the parent record failed: " + parentErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await adminClient.from("audit_logs").insert({
        school_id,
        user_id: userData.user.id,
        action: "parent_login_updated",
        entity_type: "user",
        entity_id: user_id,
        metadata: { email_changed: emailChanged, password_changed: !!password },
      });
      return new Response(
        JSON.stringify({ id: user_id, email: newEmail, message: "Parent login updated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin password reset: change the real Auth password and keep the stored
    // copy (shown on the credentials card) in sync, so the two never drift.
    if (isSetPassword) {
      if (role === "admin") {
        return new Response(
          JSON.stringify({ error: "Use the staff screen to reset staff passwords" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const table = role === "teacher" ? "teachers" : "parents";
      const { data: target } = await adminClient
        .from(table).select("id").eq("user_id", user_id).eq("school_id", school_id).maybeSingle();
      if (!target) {
        return new Response(
          JSON.stringify({ error: `No ${role} login found in your school` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { error: pwErr } = await adminClient.auth.admin.updateUserById(user_id!, { password });
      if (pwErr) {
        return new Response(
          JSON.stringify({ error: pwErr.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await adminClient.from(table).update({ password }).eq("id", target.id);
      await adminClient.from("audit_logs").insert({
        school_id,
        user_id: userData.user.id,
        action: `${role}_password_reset`,
        entity_type: "user",
        entity_id: user_id,
        metadata: {},
      });
      return new Response(
        JSON.stringify({ id: user_id, message: "Password updated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Links a parent record to the student this account is for.
    const linkStudent = async (parentId: string) => {
      if (!studentId) return;
      const { error: linkErr } = await adminClient.from("parent_students").insert({
        school_id,
        parent_id: parentId,
        student_id: studentId,
        relationship: (extra?.relationship as string | undefined) ?? "guardian",
      });
      if (linkErr && linkErr.code !== "23505") console.error("Parent link error:", linkErr);
    };

    // Siblings share one parent login: reuse it instead of failing on the email.
    let orphanParentId: string | null = null;
    if (role === "parent") {
      const { data: existing } = await adminClient
        .from("parents").select("id, user_id").eq("school_id", school_id).ilike("email", email).maybeSingle();
      if (existing?.user_id) {
        await linkStudent(existing.id);
        return new Response(
          JSON.stringify({ id: existing.user_id, email, username: email, existing: true, message: "Linked to the existing parent account" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // A parent row made earlier without a login: attach the new login to it.
      orphanParentId = existing?.id ?? null;
    }

    // Create auth user with service role
    const { data: newAuthUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
      app_metadata: { role, school_id },
    });

    // A parent login whose parents row was deleted earlier (student/parent
    // removed) still exists in Auth. Re-admitting with the same mobile must
    // reuse it instead of failing with "already registered".
    if (createErr && role === "parent" && /already (been )?registered|already exists/i.test(createErr.message)) {
      const { data: prof } = await adminClient
        .from("profiles").select("id, role, school_id").ilike("email", email).maybeSingle();
      if (prof?.id && (prof.role === "parent" || !prof.role)) {
        const { data: owned } = await adminClient
          .from("parents").select("id, school_id").eq("user_id", prof.id);
        // Still belongs to another (existing) school → don't take it over.
        const { data: otherSchool } = prof.school_id && prof.school_id !== school_id
          ? await adminClient.from("schools").select("id").eq("id", prof.school_id).maybeSingle()
          : { data: null };
        if (otherSchool || (owned ?? []).some((p) => p.school_id !== school_id)) {
          return new Response(
            JSON.stringify({ error: "This mobile number is already a parent login in another school" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { error: authUpdErr } = await adminClient.auth.admin.updateUserById(prof.id, {
          password,
          user_metadata: { full_name },
          app_metadata: { role, school_id },
        });
        if (authUpdErr) {
          return new Response(
            JSON.stringify({ error: authUpdErr.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        await adminClient.from("profiles").update({
          role, school_id, full_name, email, phone: phone || null, status: "active",
        }).eq("id", prof.id);
        const parentRow = {
          user_id: prof.id, school_id, full_name, email, phone: phone || null,
          occupation: extra?.occupation || null, address: extra?.address || null,
          status: "active", password,
        };
        const { error: parentErr } = orphanParentId
          ? await adminClient.from("parents").update(parentRow).eq("id", orphanParentId)
          : await adminClient.from("parents").insert(parentRow);
        if (parentErr) {
          return new Response(
            JSON.stringify({ error: "Could not save the parent: " + parentErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { data: revived } = await adminClient
          .from("parents").select("id").eq("user_id", prof.id).eq("school_id", school_id).maybeSingle();
        if (revived) await linkStudent(revived.id);
        await adminClient.from("audit_logs").insert({
          school_id, user_id: userData.user.id, action: "parent_created",
          entity_type: "user", entity_id: prof.id, metadata: { email, full_name, reused_login: true },
        });
        return new Response(
          JSON.stringify({ id: prof.id, email, username: email, password, message: "parent account created successfully" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

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
        ...(role === "admin" ? { staff_role_id: staffRoleId } : {}),
      })
      .eq("id", newUserId);

    if (profileErr && role === "admin") {
      // Without staff_role_id the account would count as a school owner.
      await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
      return new Response(
        JSON.stringify({ error: "Could not set up the staff account: " + profileErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
        password,
      });
      if (teacherErr) {
        console.error("Teacher insert error:", teacherErr);
      }
    } else if (role === "parent") {
      const parentRow = {
        user_id: newUserId,
        school_id,
        full_name,
        email,
        phone: phone || null,
        occupation: extra?.occupation || null,
        address: extra?.address || null,
        status: "active",
        password,
      };
      const { error: parentErr } = orphanParentId
        ? await adminClient.from("parents").update(parentRow).eq("id", orphanParentId)
        : await adminClient.from("parents").insert(parentRow);
      if (parentErr) {
        console.error("Parent insert error:", parentErr);
        // Don't leave a login with no parent behind it.
        if (!orphanParentId) await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
        return new Response(
          JSON.stringify({ error: "Could not save the parent: " + parentErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: newParent } = await adminClient
        .from("parents").select("id").eq("user_id", newUserId).maybeSingle();
      if (newParent) await linkStudent(newParent.id);
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
      JSON.stringify({
        id: newUserId,
        email,
        username: email,
        password,
        message: `${role} account created successfully`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err instanceof Error && err.message) || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
