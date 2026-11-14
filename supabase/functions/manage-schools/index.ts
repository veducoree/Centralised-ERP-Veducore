/**
 * manage-schools — Veducore superadmin API.
 *
 * Every request must carry the Supabase access token of a signed-in
 * Veducore team member (a row in veducore_admins with status 'active').
 * Roles:
 *   owner   — everything, including team management and deleting schools
 *   admin   — everything except team management and deleting schools
 *   support — read-only on schools (no credentials), full support desk
 *
 * POST { action, ...params }. Every write is recorded in platform_audit_log.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

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

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Role = "owner" | "admin" | "support";
interface Me { id: string; email: string; full_name: string; role: Role }

const MODULE_KEYS = [
  "notifications", "holidays", "students", "admissions", "parents", "teachers",
  "classes", "subjects", "timetable", "attendance", "exams", "sessions", "fees",
  "transport", "tracking", "id_cards", "documents",
];
const GST_RATE = 0.18;
const DAY = 86_400_000;

function need<T>(v: T | undefined | null, name: string): T {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    throw new HttpError(400, `${name} is required`);
  }
  return v;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function paise(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${name} must be a positive amount`);
  return Math.round(n);
}

function cycleMonths(cycle: string) {
  return cycle === "monthly" ? 1 : cycle === "quarterly" ? 3 : 12;
}

function addMonths(isoDate: string, months: number) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // ── Authenticate ───────────────────────────────────────────────────────
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new HttpError(401, "Not signed in");
    const { data: userData, error: userErr } = await db.auth.getUser(token);
    if (userErr || !userData?.user) throw new HttpError(401, "Session expired — please sign in again");

    const { data: meRow } = await db
      .from("veducore_admins")
      .select("id, email, full_name, role, status")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!meRow) throw new HttpError(403, "This account is not a Veducore team member");
    if (meRow.status !== "active") throw new HttpError(403, "Your Veducore account is disabled");
    const me = meRow as Me;

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* empty */ }
    const action: string = body.action ?? "me";

    const ctx = { db, me, body };
    const handler = ACTIONS[action];
    if (!handler) throw new HttpError(400, `Unknown action "${action}"`);
    if (!handler.roles.includes(me.role)) {
      throw new HttpError(403, "Your role does not allow this action");
    }
    return json(await handler.run(ctx));
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface Ctx { db: SupabaseClient; me: Me; body: Record<string, any> }

async function audit(ctx: Ctx, action: string, schoolId: string | null, details: Record<string, unknown> = {}) {
  let schoolName: string | null = (details.school_name as string) ?? null;
  if (schoolId && !schoolName) {
    const { data } = await ctx.db.from("schools").select("name").eq("id", schoolId).maybeSingle();
    schoolName = data?.name ?? null;
  }
  await ctx.db.from("platform_audit_log").insert({
    actor_id: ctx.me.id,
    actor_name: ctx.me.full_name,
    actor_email: ctx.me.email,
    action,
    school_id: schoolId,
    school_name: schoolName,
    details,
  });
}

async function schoolStats(db: SupabaseClient) {
  const { data, error } = await db.rpc("platform_school_stats");
  if (error) throw new HttpError(500, `Stats unavailable: ${error.message}`);
  const map = new Map<string, any>();
  for (const r of data ?? []) map.set(r.school_id, r);
  return map;
}

function planPrice(plan: any, students: number) {
  if (!plan) return 0;
  return Number(plan.base_price) + Number(plan.price_per_student) * students;
}

function subscriptionAmount(sub: any, plan: any, students: number) {
  if (sub?.price_override !== null && sub?.price_override !== undefined) return Number(sub.price_override);
  const billable = sub?.student_limit ? Math.max(students, 0) : students;
  return planPrice(plan, billable);
}

/** Yearly-equivalent revenue in paise → monthly. */
function monthlyValue(amount: number, cycle: string) {
  return Math.round(amount / cycleMonths(cycle));
}

async function adminProfileFor(db: SupabaseClient, schoolId: string) {
  const { data } = await db
    .from("profiles")
    .select("id, full_name, email, phone, status, created_at, staff_role_id")
    .eq("school_id", schoolId)
    .eq("role", "admin")
    .order("created_at", { ascending: true });
  // The owner is the admin without a staff role, else the oldest admin.
  return (data ?? []).find((p: any) => !p.staff_role_id) ?? (data ?? [])[0] ?? null;
}

async function loadSchoolsFull(ctx: Ctx) {
  const { db, me } = ctx;
  const [{ data: schools, error }, stats, { data: subs }, { data: plans }, { data: admins }, { data: gateways }] =
    await Promise.all([
      db.from("schools").select("*").order("created_at", { ascending: false }),
      schoolStats(db),
      db.from("school_subscriptions").select("*"),
      db.from("platform_plans").select("*"),
      db.from("profiles").select("id, school_id, full_name, email, phone, created_at, staff_role_id")
        .eq("role", "admin").order("created_at", { ascending: true }),
      db.from("payment_gateways").select("school_id, is_active, key_id, verified_at"),
    ]);
  if (error) throw new HttpError(500, error.message);

  const subMap = new Map((subs ?? []).map((s: any) => [s.school_id, s]));
  const planMap = new Map((plans ?? []).map((p: any) => [p.id, p]));
  const gwMap = new Map((gateways ?? []).map((g: any) => [g.school_id, g]));
  const adminMap = new Map<string, any>();
  for (const a of admins ?? []) {
    const cur = adminMap.get(a.school_id);
    if (!cur || (cur.staff_role_id && !a.staff_role_id)) adminMap.set(a.school_id, a);
  }
  const showCredentials = me.role !== "support";

  return (schools ?? []).map((s: any) => {
    const st = stats.get(s.id) ?? {};
    const sub = subMap.get(s.id) ?? null;
    const plan = sub?.plan_id ? planMap.get(sub.plan_id) ?? null : null;
    const ad = adminMap.get(s.id);
    const gw = gwMap.get(s.id);
    const students = Number(st.students ?? 0);
    const amount = sub ? subscriptionAmount(sub, plan, students) : 0;
    return {
      id: s.id,
      name: s.name,
      address: s.address ?? "",
      city: s.city ?? "",
      contactNumber: s.contact_number ?? "",
      email: s.email ?? "",
      academicYear: s.academic_year ?? "",
      logoUrl: s.logo_url ?? null,
      status: (s.status ?? "Active") === "Active" ? "Active" : "Suspended",
      suspendedAt: s.suspended_at ?? null,
      suspensionReason: s.suspension_reason ?? null,
      disabledModules: s.disabled_modules ?? [],
      createdAt: s.created_at,
      adminUserId: ad?.id ?? null,
      adminName: ad?.full_name ?? "",
      adminEmail: ad?.email ?? s.email ?? "",
      adminPhone: ad?.phone ?? "",
      adminPassword: showCredentials ? s.admin_password_reference ?? null : null,
      students,
      activeStudents: Number(st.active_students ?? 0),
      teachers: Number(st.teachers ?? 0),
      parents: Number(st.parents ?? 0),
      classes: Number(st.classes ?? 0),
      sections: Number(st.sections ?? 0),
      attendance30d: Number(st.attendance_30d ?? 0),
      lastAttendance: st.last_attendance ?? null,
      feesCollected30d: Number(st.fees_collected_30d ?? 0),
      onlinePaid30d: Number(st.online_paid_30d ?? 0),
      onlineVolume30d: Number(st.online_volume_30d ?? 0),
      notifications30d: Number(st.notifications_30d ?? 0),
      gateway: gw ? { active: gw.is_active, mode: String(gw.key_id).startsWith("rzp_live_") ? "live" : "test", verifiedAt: gw.verified_at } : null,
      subscription: sub ? {
        planId: sub.plan_id,
        planName: plan?.name ?? null,
        planCode: plan?.code ?? null,
        status: sub.status,
        billingCycle: sub.billing_cycle,
        priceOverride: sub.price_override,
        studentLimit: sub.student_limit ?? plan?.max_students ?? null,
        trialEndsAt: sub.trial_ends_at,
        currentPeriodStart: sub.current_period_start,
        currentPeriodEnd: sub.current_period_end,
        notes: sub.notes,
        amount,
        mrr: ["active", "past_due"].includes(sub.status) ? monthlyValue(amount, sub.billing_cycle) : 0,
      } : null,
      idCardTemplateUrl: s.id_card_template_url ?? null,
      idCardConfig: s.id_card_config ?? null,
    };
  });
}

function healthOf(s: any) {
  // Recent attendance is the best single signal that a school uses Veducore daily.
  if (s.status !== "Active") return "suspended";
  if (!s.lastAttendance) return s.students > 0 ? "inactive" : "setup";
  const days = (Date.now() - new Date(s.lastAttendance).getTime()) / DAY;
  if (days <= 3) return "healthy";
  if (days <= 14) return "at_risk";
  return "inactive";
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

const ALL: Role[] = ["owner", "admin", "support"];
const MANAGERS: Role[] = ["owner", "admin"];
const OWNER: Role[] = ["owner"];

const ACTIONS: Record<string, { roles: Role[]; run: (ctx: Ctx) => Promise<unknown> }> = {
  // ── Session ────────────────────────────────────────────────────────────────
  me: {
    roles: ALL,
    run: async (ctx) => {
      await ctx.db.from("veducore_admins").update({ last_login_at: new Date().toISOString() }).eq("id", ctx.me.id);
      return { me: ctx.me };
    },
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────
  dashboard: {
    roles: ALL,
    run: async (ctx) => {
      const [schools, { data: growth }, { count: openTickets }, { data: invoices }, { data: activity }] =
        await Promise.all([
          loadSchoolsFull(ctx),
          ctx.db.rpc("platform_growth", { p_months: 12 }),
          ctx.db.from("support_tickets").select("id", { count: "exact", head: true })
            .in("status", ["open", "in_progress"]),
          ctx.db.from("platform_invoices").select("total_amount, status, paid_at, due_date"),
          ctx.db.from("platform_audit_log").select("*").order("created_at", { ascending: false }).limit(12),
        ]);

      const now = Date.now();
      const in30 = now + 30 * DAY;
      const renewals = schools
        .filter((s: any) => {
          const end = s.subscription?.status === "trial" ? s.subscription?.trialEndsAt : s.subscription?.currentPeriodEnd;
          if (!end || s.status !== "Active") return false;
          const t = new Date(end).getTime();
          return t <= in30;
        })
        .map((s: any) => ({
          id: s.id, name: s.name,
          planName: s.subscription?.planName,
          status: s.subscription?.status,
          endsOn: s.subscription?.status === "trial" ? s.subscription?.trialEndsAt : s.subscription?.currentPeriodEnd,
          amount: s.subscription?.amount ?? 0,
        }))
        .sort((a: any, b: any) => String(a.endsOn).localeCompare(String(b.endsOn)));

      const health = { healthy: 0, at_risk: 0, inactive: 0, setup: 0, suspended: 0 } as Record<string, number>;
      const atRisk: any[] = [];
      for (const s of schools) {
        const h = healthOf(s);
        health[h]++;
        if (h === "at_risk" || h === "inactive") {
          atRisk.push({ id: s.id, name: s.name, students: s.students, lastAttendance: s.lastAttendance, health: h });
        }
      }

      const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
      const inv = invoices ?? [];
      const outstanding = inv.filter((i: any) => i.status === "issued");
      const planMix: Record<string, number> = {};
      for (const s of schools) {
        const k = s.subscription?.planName ?? "No plan";
        planMix[k] = (planMix[k] ?? 0) + 1;
      }

      return {
        summary: {
          totalSchools: schools.length,
          activeSchools: schools.filter((s: any) => s.status === "Active").length,
          suspendedSchools: schools.filter((s: any) => s.status !== "Active").length,
          trialSchools: schools.filter((s: any) => s.subscription?.status === "trial").length,
          totalStudents: schools.reduce((a: number, s: any) => a + s.students, 0),
          totalTeachers: schools.reduce((a: number, s: any) => a + s.teachers, 0),
          totalParents: schools.reduce((a: number, s: any) => a + s.parents, 0),
          mrr: schools.reduce((a: number, s: any) => a + (s.subscription?.mrr ?? 0), 0),
          collectedThisYear: inv
            .filter((i: any) => i.status === "paid" && i.paid_at && new Date(i.paid_at).getTime() >= yearStart)
            .reduce((a: number, i: any) => a + Number(i.total_amount), 0),
          outstandingAmount: outstanding.reduce((a: number, i: any) => a + Number(i.total_amount), 0),
          overdueInvoices: outstanding.filter((i: any) => i.due_date && new Date(i.due_date).getTime() < now).length,
          onlineVolume30d: schools.reduce((a: number, s: any) => a + s.onlineVolume30d, 0),
          onlinePaid30d: schools.reduce((a: number, s: any) => a + s.onlinePaid30d, 0),
          openTickets: openTickets ?? 0,
        },
        growth: (growth ?? []).map((g: any) => ({
          month: g.month,
          newSchools: Number(g.new_schools),
          newStudents: Number(g.new_students),
          onlineVolume: Number(g.online_volume),
        })),
        health,
        atRisk: atRisk.slice(0, 8),
        renewals: renewals.slice(0, 8),
        planMix,
        topSchools: [...schools].sort((a: any, b: any) => b.students - a.students).slice(0, 5)
          .map((s: any) => ({ id: s.id, name: s.name, students: s.students, teachers: s.teachers, planName: s.subscription?.planName })),
        recentActivity: activity ?? [],
      };
    },
  },

  // ── Schools ────────────────────────────────────────────────────────────────
  list: {
    roles: ALL,
    run: async (ctx) => {
      const schools = await loadSchoolsFull(ctx);
      return { schools: schools.map((s: any) => ({ ...s, health: healthOf(s) })) };
    },
  },

  "school-detail": {
    roles: ALL,
    run: async (ctx) => {
      const schoolId = need(ctx.body.school_id, "school_id");
      const all = await loadSchoolsFull(ctx);
      const school = all.find((s: any) => s.id === schoolId);
      if (!school) throw new HttpError(404, "School not found");

      let adminLastSignIn: string | null = null;
      if (school.adminUserId) {
        const { data } = await ctx.db.auth.admin.getUserById(school.adminUserId);
        adminLastSignIn = data?.user?.last_sign_in_at ?? null;
      }
      const [{ data: staff }, { data: invoices }, { data: tickets }, { data: activity }, { data: session }] =
        await Promise.all([
          ctx.db.from("profiles").select("id, full_name, email, status, staff_role_id, created_at")
            .eq("school_id", schoolId).eq("role", "admin").order("created_at"),
          ctx.db.from("platform_invoices").select("*").eq("school_id", schoolId)
            .order("issue_date", { ascending: false }).limit(10),
          ctx.db.from("support_tickets").select("id, ticket_number, subject, status, priority, last_reply_at")
            .eq("school_id", schoolId).order("last_reply_at", { ascending: false }).limit(5),
          ctx.db.from("platform_audit_log").select("*").eq("school_id", schoolId)
            .order("created_at", { ascending: false }).limit(15),
          ctx.db.from("academic_sessions").select("name, start_date, end_date")
            .eq("school_id", schoolId).eq("is_current", true).maybeSingle(),
        ]);

      return {
        school: { ...school, health: healthOf(school) },
        adminLastSignIn,
        adminAccounts: (staff ?? []).map((p: any) => ({
          id: p.id, name: p.full_name, email: p.email, status: p.status,
          isOwner: !p.staff_role_id, createdAt: p.created_at,
        })),
        currentSession: session ?? null,
        invoices: invoices ?? [],
        tickets: tickets ?? [],
        activity: activity ?? [],
      };
    },
  },

  "create-school": {
    roles: MANAGERS,
    run: async (ctx) => {
      const b = ctx.body;
      const name = need(str(b.name), "School name");
      const email = need(str(b.email), "Admin email").toLowerCase();
      const adminName = need(str(b.admin_name), "Admin name");
      const password = need(str(b.admin_password), "Admin password");
      if (password.length < 8) throw new HttpError(400, "Admin password must be at least 8 characters");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Enter a valid admin email");

      const { data: school, error: schoolErr } = await ctx.db.from("schools").insert({
        name,
        address: str(b.address),
        city: str(b.city),
        contact_number: str(b.contact_number),
        email,
        academic_year: str(b.academic_year) ?? "2026-27",
        timezone: "Asia/Kolkata",
        currency: "INR",
        currency_symbol: "₹",
        admin_password_reference: password,
        status: "Active",
      }).select().maybeSingle();
      if (schoolErr || !school) throw new HttpError(400, schoolErr?.message ?? "Failed to create school");

      const { data: authUser, error: authErr } = await ctx.db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: adminName },
        app_metadata: { role: "admin", school_id: school.id },
      });
      if (authErr || !authUser?.user) {
        await ctx.db.from("schools").delete().eq("id", school.id);
        throw new HttpError(400, authErr?.message ?? "Failed to create admin login");
      }

      await ctx.db.from("profiles").upsert({
        id: authUser.user.id,
        school_id: school.id,
        role: "admin",
        full_name: adminName,
        email,
        phone: str(b.contact_number),
        status: "active",
      }, { onConflict: "id" });

      // Subscription row is created by trigger; apply the chosen plan.
      if (b.plan_id) {
        const { data: plan } = await ctx.db.from("platform_plans").select("*").eq("id", b.plan_id).maybeSingle();
        if (plan) {
          const isTrial = plan.code === "trial";
          const trialDays = Number(b.trial_days) > 0 ? Number(b.trial_days) : 30;
          const start = today();
          await ctx.db.from("school_subscriptions").upsert({
            school_id: school.id,
            plan_id: plan.id,
            status: isTrial ? "trial" : "active",
            billing_cycle: plan.billing_cycle,
            student_limit: plan.max_students,
            trial_ends_at: isTrial ? new Date(Date.now() + trialDays * DAY).toISOString().slice(0, 10) : null,
            current_period_start: isTrial ? null : start,
            current_period_end: isTrial ? null : addMonths(start, cycleMonths(plan.billing_cycle)),
            updated_at: new Date().toISOString(),
          }, { onConflict: "school_id" });
        }
      }

      await audit(ctx, "school.created", school.id, { school_name: name, admin_email: email });
      return { school_id: school.id, admin_user_id: authUser.user.id };
    },
  },

  "update-school": {
    roles: MANAGERS,
    run: async (ctx) => {
      const schoolId = need(ctx.body.school_id, "school_id");
      const f = ctx.body.fields ?? {};
      const update: Record<string, unknown> = {};
      if ("name" in f) update.name = need(str(f.name), "School name");
      for (const [k, col] of [["address", "address"], ["city", "city"], ["contactNumber", "contact_number"],
        ["email", "email"], ["academicYear", "academic_year"]] as const) {
        if (k in f) update[col] = str(f[k]);
      }
      if (!Object.keys(update).length) throw new HttpError(400, "Nothing to update");
      const { error } = await ctx.db.from("schools").update(update).eq("id", schoolId);
      if (error) throw new HttpError(400, error.message);
      await audit(ctx, "school.updated", schoolId, { fields: Object.keys(update) });
      return { success: true };
    },
  },

  "update-password": {
    roles: MANAGERS,
    run: async (ctx) => {
      const schoolId = need(ctx.body.school_id, "school_id");
      const pw = need(str(ctx.body.new_password), "new_password");
      if (pw.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
      const adminProfile = await adminProfileFor(ctx.db, schoolId);
      if (!adminProfile) throw new HttpError(404, "This school has no admin account");
      const { error } = await ctx.db.auth.admin.updateUserById(adminProfile.id, { password: pw });
      if (error) throw new HttpError(400, error.message);
      await ctx.db.from("schools").update({ admin_password_reference: pw }).eq("id", schoolId);
      await audit(ctx, "school.admin_password_reset", schoolId, { admin_email: adminProfile.email });
      return { success: true };
    },
  },

  "set-status": {
    roles: MANAGERS,
    run: async (ctx) => {
      const schoolId = need(ctx.body.school_id, "school_id");
      const status = ctx.body.status === "Active" ? "Active" : "Inactive";
      const { data: current } = await ctx.db.from("schools").select("status, suspended_at").eq("id", schoolId).maybeSingle();
      if (!current) throw new HttpError(404, "School not found");

      if (status === "Inactive") {
        const reason = need(str(ctx.body.reason), "Reason");
        const { error } = await ctx.db.from("schools").update({
          status: "Inactive", suspended_at: new Date().toISOString(), suspension_reason: reason,
        }).eq("id", schoolId);
        if (error) throw new HttpError(400, error.message);
        await audit(ctx, "school.suspended", schoolId, { reason });
      } else {
        // Schools suspended before migration 038 had every profile switched off.
        if ((current.status ?? "Active") !== "Active" && !current.suspended_at) {
          await ctx.db.from("profiles").update({ status: "active" }).eq("school_id", schoolId);
        }
        const { error } = await ctx.db.from("schools").update({
          status: "Active", suspended_at: null, suspension_reason: null,
        }).eq("id", schoolId);
        if (error) throw new HttpError(400, error.message);
        await audit(ctx, "school.reactivated", schoolId);
      }
      return { success: true, status: status === "Active" ? "Active" : "Suspended" };
    },
  },

  "set-modules": {
    roles: MANAGERS,
    run: async (ctx) => {
      const schoolId = need(ctx.body.school_id, "school_id");
      const disabled = (Array.isArray(ctx.body.disabled_modules) ? ctx.body.disabled_modules : [])
        .filter((m: unknown) => typeof m === "string" && MODULE_KEYS.includes(m as string));
      const { error } = await ctx.db.from("schools").update({ disabled_modules: disabled }).eq("id", schoolId);
      if (error) throw new HttpError(400, error.message);
      await audit(ctx, "school.modules_changed", schoolId, { disabled_modules: disabled });
      return { success: true, disabled_modules: disabled };
    },
  },

  impersonate: {
    roles: MANAGERS,
    run: async (ctx) => {
      const schoolId = need(ctx.body.school_id, "school_id");
      const redirectTo = str(ctx.body.redirect_to) ?? undefined;
      const adminProfile = await adminProfileFor(ctx.db, schoolId);
      if (!adminProfile?.email) throw new HttpError(404, "This school has no admin account");
      const { data, error } = await ctx.db.auth.admin.generateLink({
        type: "magiclink",
        email: adminProfile.email,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error || !data?.properties?.action_link) throw new HttpError(400, error?.message ?? "Could not create sign-in link");
      await audit(ctx, "school.impersonated", schoolId, { admin_email: adminProfile.email });
      return { link: data.properties.action_link, email: adminProfile.email };
    },
  },

  delete: {
    roles: OWNER,
    run: async (ctx) => {
      const schoolId = need(ctx.body.school_id, "school_id");
      const { data: school } = await ctx.db.from("schools").select("name").eq("id", schoolId).maybeSingle();
      if (!school) throw new HttpError(404, "School not found");
      if (str(ctx.body.confirm_name)?.toLowerCase() !== String(school.name).trim().toLowerCase()) {
        throw new HttpError(400, "Type the school name exactly to confirm");
      }

      const { data: users } = await ctx.db.from("profiles").select("id").eq("school_id", schoolId);
      const userIds = (users ?? []).map((u: any) => u.id);

      // Tables reference schools ON DELETE CASCADE; delete the school, then logins.
      const { error } = await ctx.db.from("schools").delete().eq("id", schoolId);
      if (error) throw new HttpError(500, `Failed to delete school: ${error.message}`);

      let authUsersDeleted = 0;
      for (const uid of userIds) {
        const { error: e } = await ctx.db.auth.admin.deleteUser(uid);
        if (!e) authUsersDeleted++;
      }
      await audit(ctx, "school.deleted", schoolId, { school_name: school.name, logins_deleted: authUsersDeleted });
      return { success: true, authUsersDeleted };
    },
  },

  // ── Plans & subscriptions ──────────────────────────────────────────────────
  "plans-list": {
    roles: ALL,
    run: async (ctx) => {
      const { data, error } = await ctx.db.from("platform_plans").select("*").order("sort_order");
      if (error) throw new HttpError(500, error.message);
      return { plans: data ?? [] };
    },
  },

  "plan-save": {
    roles: MANAGERS,
    run: async (ctx) => {
      const p = ctx.body.plan ?? {};
      const row: Record<string, unknown> = {
        name: need(str(p.name), "Plan name"),
        description: str(p.description),
        base_price: paise(p.base_price ?? 0, "Base price"),
        price_per_student: paise(p.price_per_student ?? 0, "Price per student"),
        billing_cycle: ["monthly", "quarterly", "yearly"].includes(p.billing_cycle) ? p.billing_cycle : "yearly",
        max_students: p.max_students ? Math.max(1, Math.round(Number(p.max_students))) : null,
        features: Array.isArray(p.features) ? p.features.map(String).filter((s: string) => s.trim()) : [],
        is_active: p.is_active !== false,
        sort_order: Number(p.sort_order ?? 0),
        updated_at: new Date().toISOString(),
      };
      let id = p.id as string | undefined;
      if (id) {
        const { error } = await ctx.db.from("platform_plans").update(row).eq("id", id);
        if (error) throw new HttpError(400, error.message);
      } else {
        row.code = (str(p.code) ?? String(row.name)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const { data, error } = await ctx.db.from("platform_plans").insert(row).select("id").single();
        if (error) throw new HttpError(400, error.message);
        id = data.id;
      }
      await audit(ctx, p.id ? "plan.updated" : "plan.created", null, { plan: row.name });
      return { success: true, id };
    },
  },

  "subscription-save": {
    roles: MANAGERS,
    run: async (ctx) => {
      const schoolId = need(ctx.body.school_id, "school_id");
      const s = ctx.body.subscription ?? {};
      const status = ["trial", "active", "past_due", "cancelled", "expired"].includes(s.status) ? s.status : "active";
      const row = {
        school_id: schoolId,
        plan_id: s.plan_id || null,
        status,
        billing_cycle: ["monthly", "quarterly", "yearly"].includes(s.billing_cycle) ? s.billing_cycle : "yearly",
        price_override: s.price_override === null || s.price_override === "" || s.price_override === undefined
          ? null : paise(s.price_override, "Custom price"),
        student_limit: s.student_limit ? Math.max(1, Math.round(Number(s.student_limit))) : null,
        trial_ends_at: s.trial_ends_at || null,
        current_period_start: s.current_period_start || null,
        current_period_end: s.current_period_end || null,
        notes: str(s.notes),
        updated_at: new Date().toISOString(),
      };
      const { error } = await ctx.db.from("school_subscriptions").upsert(row, { onConflict: "school_id" });
      if (error) throw new HttpError(400, error.message);
      await audit(ctx, "subscription.updated", schoolId, { status, plan_id: row.plan_id, period_end: row.current_period_end });
      return { success: true };
    },
  },

  // ── Invoices ───────────────────────────────────────────────────────────────
  "invoices-list": {
    roles: ALL,
    run: async (ctx) => {
      let q = ctx.db.from("platform_invoices").select("*, schools(name)").order("created_at", { ascending: false }).limit(500);
      if (ctx.body.school_id) q = q.eq("school_id", ctx.body.school_id);
      const { data, error } = await q;
      if (error) throw new HttpError(500, error.message);
      return {
        invoices: (data ?? []).map((i: any) => ({ ...i, school_name: i.schools?.name ?? "Deleted school", schools: undefined })),
      };
    },
  },

  "invoice-create": {
    roles: MANAGERS,
    run: async (ctx) => {
      const i = ctx.body.invoice ?? {};
      const schoolId = need(i.school_id, "School");
      const amount = paise(need(i.amount, "Amount"), "Amount");
      const tax = i.apply_gst === false ? 0 : Math.round(amount * GST_RATE);
      const { data, error } = await ctx.db.from("platform_invoices").insert({
        school_id: schoolId,
        description: need(str(i.description), "Description"),
        period_start: i.period_start || null,
        period_end: i.period_end || null,
        amount,
        tax_amount: tax,
        total_amount: amount + tax,
        status: i.status === "draft" ? "draft" : "issued",
        issue_date: i.issue_date || today(),
        due_date: i.due_date || null,
        notes: str(i.notes),
        created_by: ctx.me.id,
      }).select().single();
      if (error) throw new HttpError(400, error.message);

      // Extend the subscription period when the invoice covers a later period.
      if (i.extend_subscription && i.period_end) {
        await ctx.db.from("school_subscriptions").update({
          current_period_start: i.period_start || null,
          current_period_end: i.period_end,
          updated_at: new Date().toISOString(),
        }).eq("school_id", schoolId);
      }
      await audit(ctx, "invoice.created", schoolId, { invoice: data.invoice_number, total: data.total_amount });
      return { invoice: data };
    },
  },

  "invoice-update": {
    roles: MANAGERS,
    run: async (ctx) => {
      const id = need(ctx.body.invoice_id, "invoice_id");
      const status = ctx.body.status;
      if (!["draft", "issued", "paid", "void"].includes(status)) throw new HttpError(400, "Invalid status");
      const update: Record<string, unknown> = { status };
      if (status === "paid") {
        update.paid_at = ctx.body.paid_at ? new Date(ctx.body.paid_at).toISOString() : new Date().toISOString();
        update.payment_method = str(ctx.body.payment_method);
        update.payment_reference = str(ctx.body.payment_reference);
      } else {
        update.paid_at = null;
      }
      const { data, error } = await ctx.db.from("platform_invoices").update(update).eq("id", id).select().single();
      if (error) throw new HttpError(400, error.message);

      // Paid invoice → subscription is current again.
      if (status === "paid") {
        await ctx.db.from("school_subscriptions").update({ status: "active", updated_at: new Date().toISOString() })
          .eq("school_id", data.school_id).in("status", ["past_due", "expired", "trial"]);
      }
      await audit(ctx, `invoice.${status}`, data.school_id, { invoice: data.invoice_number });
      return { invoice: data };
    },
  },

  // ── Announcements ──────────────────────────────────────────────────────────
  "announcements-list": {
    roles: ALL,
    run: async (ctx) => {
      const { data, error } = await ctx.db.from("platform_announcements").select("*")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw new HttpError(500, error.message);
      return { announcements: data ?? [] };
    },
  },

  "announcement-create": {
    roles: MANAGERS,
    run: async (ctx) => {
      const a = ctx.body.announcement ?? {};
      const target = a.target === "selected" ? "selected" : "all";
      const schoolIds: string[] = target === "selected" ? (Array.isArray(a.school_ids) ? a.school_ids : []) : [];
      if (target === "selected" && !schoolIds.length) throw new HttpError(400, "Pick at least one school");
      const pushAudience = ["all", "teachers", "parents"].includes(a.push_audience) ? a.push_audience : null;
      const title = need(str(a.title), "Title");
      const message = need(str(a.body), "Message");

      const { data, error } = await ctx.db.from("platform_announcements").insert({
        title,
        body: message,
        severity: ["info", "success", "warning", "critical"].includes(a.severity) ? a.severity : "info",
        target,
        school_ids: schoolIds,
        push_audience: pushAudience,
        starts_at: a.starts_at || new Date().toISOString(),
        ends_at: a.ends_at || null,
        created_by: ctx.me.id,
        created_by_name: ctx.me.full_name,
      }).select().single();
      if (error) throw new HttpError(400, error.message);

      // Optional push to each school's teachers/parents through the
      // notifications pipeline (the insert trigger sends the push).
      let pushedSchools = 0;
      if (pushAudience) {
        let q = ctx.db.from("schools").select("id").eq("status", "Active");
        if (target === "selected") q = q.in("id", schoolIds);
        const { data: targets } = await q;
        const rows = (targets ?? []).map((s: any) => ({
          school_id: s.id,
          audience: pushAudience,
          title,
          message,
          type: "info",
          category: "announcement",
          priority: a.severity === "critical" ? "urgent" : a.severity === "warning" ? "high" : "normal",
        }));
        if (rows.length) {
          const { error: nErr } = await ctx.db.from("notifications").insert(rows);
          if (nErr) throw new HttpError(400, `Announcement saved, but push failed: ${nErr.message}`);
          pushedSchools = rows.length;
        }
      }
      await audit(ctx, "announcement.created", null, { title, target, schools: schoolIds.length || "all", push: pushAudience });
      return { announcement: data, pushedSchools };
    },
  },

  "announcement-update": {
    roles: MANAGERS,
    run: async (ctx) => {
      const id = need(ctx.body.announcement_id, "announcement_id");
      if (ctx.body.delete) {
        const { error } = await ctx.db.from("platform_announcements").delete().eq("id", id);
        if (error) throw new HttpError(400, error.message);
        await audit(ctx, "announcement.deleted", null, { id });
        return { success: true };
      }
      const { error } = await ctx.db.from("platform_announcements")
        .update({ is_active: !!ctx.body.is_active }).eq("id", id);
      if (error) throw new HttpError(400, error.message);
      await audit(ctx, ctx.body.is_active ? "announcement.activated" : "announcement.deactivated", null, { id });
      return { success: true };
    },
  },

  // ── Support desk ───────────────────────────────────────────────────────────
  "tickets-list": {
    roles: ALL,
    run: async (ctx) => {
      const { data, error } = await ctx.db.from("support_tickets").select("*, schools(name)")
        .order("last_reply_at", { ascending: false }).limit(500);
      if (error) throw new HttpError(500, error.message);
      const { data: team } = await ctx.db.from("veducore_admins").select("id, full_name").eq("status", "active");
      return {
        tickets: (data ?? []).map((t: any) => ({ ...t, school_name: t.schools?.name ?? "—", schools: undefined })),
        team: team ?? [],
      };
    },
  },

  "ticket-detail": {
    roles: ALL,
    run: async (ctx) => {
      const id = need(ctx.body.ticket_id, "ticket_id");
      const [{ data: ticket }, { data: messages }] = await Promise.all([
        ctx.db.from("support_tickets").select("*, schools(name, contact_number, email)").eq("id", id).maybeSingle(),
        ctx.db.from("support_ticket_messages").select("*").eq("ticket_id", id).order("created_at"),
      ]);
      if (!ticket) throw new HttpError(404, "Ticket not found");
      return { ticket, messages: messages ?? [] };
    },
  },

  "ticket-reply": {
    roles: ALL,
    run: async (ctx) => {
      const id = need(ctx.body.ticket_id, "ticket_id");
      const text = need(str(ctx.body.body), "Reply");
      const internal = !!ctx.body.internal;
      const { data: ticket } = await ctx.db.from("support_tickets").select("id, school_id, raised_by, ticket_number, subject, status")
        .eq("id", id).maybeSingle();
      if (!ticket) throw new HttpError(404, "Ticket not found");

      const { error } = await ctx.db.from("support_ticket_messages").insert({
        ticket_id: id, author_type: "veducore", author_id: ctx.me.id,
        author_name: `${ctx.me.full_name} (Veducore)`, body: text, is_internal: internal,
      });
      if (error) throw new HttpError(400, error.message);

      if (!internal) {
        const nextStatus = ["resolved", "closed"].includes(ctx.body.status) ? ctx.body.status : "waiting";
        await ctx.db.from("support_tickets").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", id);
        if (ticket.raised_by) {
          await ctx.db.from("notifications").insert({
            school_id: ticket.school_id,
            user_id: ticket.raised_by,
            audience: "user",
            title: `Veducore replied to ticket #${ticket.ticket_number}`,
            message: text.length > 160 ? text.slice(0, 157) + "…" : text,
            type: "info",
            category: "general",
            link: "/admin/support",
          });
        }
      }
      await audit(ctx, internal ? "ticket.note" : "ticket.replied", ticket.school_id, { ticket: ticket.ticket_number });
      return { success: true };
    },
  },

  "ticket-update": {
    roles: ALL,
    run: async (ctx) => {
      const id = need(ctx.body.ticket_id, "ticket_id");
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (ctx.body.status) {
        if (!["open", "in_progress", "waiting", "resolved", "closed"].includes(ctx.body.status)) throw new HttpError(400, "Invalid status");
        update.status = ctx.body.status;
      }
      if (ctx.body.priority) {
        if (!["low", "normal", "high", "urgent"].includes(ctx.body.priority)) throw new HttpError(400, "Invalid priority");
        update.priority = ctx.body.priority;
      }
      if ("assigned_to" in ctx.body) update.assigned_to = ctx.body.assigned_to || null;
      const { data, error } = await ctx.db.from("support_tickets").update(update).eq("id", id).select("school_id, ticket_number").single();
      if (error) throw new HttpError(400, error.message);
      await audit(ctx, "ticket.updated", data.school_id, { ticket: data.ticket_number, ...update, updated_at: undefined });
      return { success: true };
    },
  },

  // ── Online payments monitor ────────────────────────────────────────────────
  "payments-overview": {
    roles: ALL,
    run: async (ctx) => {
      const since = new Date(Date.now() - 90 * DAY).toISOString();
      const [{ data: payments, error }, { data: schools }, { data: gateways }] = await Promise.all([
        ctx.db.from("online_payments")
          .select("id, school_id, fee_amount, convenience_fee, gst_amount, total_amount, status, channel, refund_status, receipt_number, created_at, paid_at, error, students(full_name, admission_number)")
          .gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
        ctx.db.from("schools").select("id, name"),
        ctx.db.from("payment_gateways").select("school_id, is_active, key_id, verified_at, updated_at"),
      ]);
      if (error) throw new HttpError(500, error.message);
      const nameMap = new Map((schools ?? []).map((s: any) => [s.id, s.name]));
      return {
        payments: (payments ?? []).map((p: any) => ({
          ...p,
          school_name: nameMap.get(p.school_id) ?? "—",
          student_name: p.students?.full_name ?? "—",
          admission_number: p.students?.admission_number ?? "",
          students: undefined,
        })),
        gateways: (gateways ?? []).map((g: any) => ({
          school_id: g.school_id,
          school_name: nameMap.get(g.school_id) ?? "—",
          active: g.is_active,
          mode: String(g.key_id).startsWith("rzp_live_") ? "live" : "test",
          key_hint: "rzp_…" + String(g.key_id).slice(-4),
          verified_at: g.verified_at,
          updated_at: g.updated_at,
        })),
        schoolsWithoutGateway: (schools ?? []).filter((s: any) => !(gateways ?? []).some((g: any) => g.school_id === s.id)).length,
      };
    },
  },

  // ── Team ───────────────────────────────────────────────────────────────────
  "team-list": {
    roles: ALL,
    run: async (ctx) => {
      const { data, error } = await ctx.db.from("veducore_admins").select("*").order("created_at");
      if (error) throw new HttpError(500, error.message);
      return { team: data ?? [] };
    },
  },

  "team-add": {
    roles: OWNER,
    run: async (ctx) => {
      const email = need(str(ctx.body.email), "Email").toLowerCase();
      const fullName = need(str(ctx.body.full_name), "Name");
      const password = need(str(ctx.body.password), "Password");
      const role = ["owner", "admin", "support"].includes(ctx.body.role) ? ctx.body.role : "support";
      if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");

      const { data: profile } = await ctx.db.from("profiles").select("id").eq("email", email).maybeSingle();
      if (profile) throw new HttpError(400, "This email already belongs to a school account — use a different email");

      const { data: created, error } = await ctx.db.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (error || !created?.user) throw new HttpError(400, error?.message ?? "Could not create login");
      const { error: insErr } = await ctx.db.from("veducore_admins").insert({
        id: created.user.id, email, full_name: fullName, role, status: "active", created_by: ctx.me.id,
      });
      if (insErr) {
        await ctx.db.auth.admin.deleteUser(created.user.id);
        throw new HttpError(400, insErr.message);
      }
      await audit(ctx, "team.added", null, { email, role });
      return { success: true };
    },
  },

  "team-update": {
    roles: OWNER,
    run: async (ctx) => {
      const id = need(ctx.body.member_id, "member_id");
      if (id === ctx.me.id) throw new HttpError(400, "You can't change your own role or status");
      const { data: target } = await ctx.db.from("veducore_admins").select("email, role, status").eq("id", id).maybeSingle();
      if (!target) throw new HttpError(404, "Team member not found");

      if (ctx.body.remove) {
        await ctx.db.from("veducore_admins").delete().eq("id", id);
        await ctx.db.auth.admin.deleteUser(id);
        await audit(ctx, "team.removed", null, { email: target.email });
        return { success: true };
      }
      const update: Record<string, unknown> = {};
      if (ctx.body.role) {
        if (!["owner", "admin", "support"].includes(ctx.body.role)) throw new HttpError(400, "Invalid role");
        update.role = ctx.body.role;
      }
      if (ctx.body.status) {
        if (!["active", "disabled"].includes(ctx.body.status)) throw new HttpError(400, "Invalid status");
        update.status = ctx.body.status;
      }
      if (ctx.body.password) {
        const pw = String(ctx.body.password);
        if (pw.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
        const { error } = await ctx.db.auth.admin.updateUserById(id, { password: pw });
        if (error) throw new HttpError(400, error.message);
      }
      if (Object.keys(update).length) {
        const { error } = await ctx.db.from("veducore_admins").update(update).eq("id", id);
        if (error) throw new HttpError(400, error.message);
      }
      // A disabled member's open sessions stop working on their next request
      // (status is checked on every call); also sign them out everywhere.
      if (update.status === "disabled") await ctx.db.auth.admin.signOut(id).catch(() => {});
      await audit(ctx, "team.updated", null, { email: target.email, ...update, password_reset: !!ctx.body.password });
      return { success: true };
    },
  },

  // ── Audit log ──────────────────────────────────────────────────────────────
  "audit-log": {
    roles: ALL,
    run: async (ctx) => {
      let q = ctx.db.from("platform_audit_log").select("*").order("created_at", { ascending: false }).limit(300);
      if (ctx.body.school_id) q = q.eq("school_id", ctx.body.school_id);
      if (ctx.body.action_prefix) q = q.like("action", `${ctx.body.action_prefix}%`);
      const { data, error } = await q;
      if (error) throw new HttpError(500, error.message);
      return { entries: data ?? [] };
    },
  },

  // ── ID cards (unchanged behaviour) ─────────────────────────────────────────
  "get-school-id-cards": {
    roles: MANAGERS,
    run: async (ctx) => getSchoolIdCards(ctx.db, need(ctx.body.school_id, "school_id")),
  },

  "update-id-card-template": {
    roles: MANAGERS,
    run: async (ctx) => {
      const schoolId = need(ctx.body.school_id, "school_id");
      const update: Record<string, unknown> = {};
      if (ctx.body.template_url !== undefined) update.id_card_template_url = ctx.body.template_url;
      if (ctx.body.template_config !== undefined) update.id_card_config = ctx.body.template_config;
      const { error } = await ctx.db.from("schools").update(update).eq("id", schoolId);
      if (error) throw new HttpError(500, error.message);
      await audit(ctx, "school.id_card_template_saved", schoolId);
      return { success: true, message: "ID Card template updated successfully." };
    },
  },
};

async function getSchoolIdCards(db: SupabaseClient, schoolId: string) {
  const { data: school } = await db.from("schools").select("*").eq("id", schoolId).maybeSingle();
  if (!school) throw new HttpError(404, "School not found");

  const [{ data: classes }, { data: sections }, { data: parents }, { data: parentStudents }, { data: students, error: studentErr }] =
    await Promise.all([
      db.from("classes").select("id, name, grade_level").eq("school_id", schoolId),
      db.from("sections").select("id, name, class_id").eq("school_id", schoolId),
      db.from("parents").select("id, phone, full_name").eq("school_id", schoolId),
      db.from("parent_students").select("parent_id, student_id").eq("school_id", schoolId),
      db.from("students").select("*").eq("school_id", schoolId).order("roll_number", { ascending: true, nullsFirst: false }),
    ]);
  if (studentErr) throw new HttpError(500, studentErr.message);

  const classMap = new Map((classes ?? []).map((c: any) => [c.id, c.name]));
  const sectionMap = new Map((sections ?? []).map((s: any) => [s.id, s.name]));
  const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]));
  const phoneMap = new Map<string, string>();
  for (const ps of parentStudents ?? []) {
    const p: any = parentMap.get(ps.parent_id);
    if (p?.phone && !phoneMap.has(ps.student_id)) phoneMap.set(ps.student_id, p.phone);
  }

  let withPhoto = 0;
  let complete = 0;
  const enriched = (students ?? []).map((st: any) => {
    const hasPhoto = Boolean(st.avatar_url && String(st.avatar_url).trim().length > 5);
    if (hasPhoto) withPhoto++;
    const className = classMap.get(st.class_id) || "Class";
    const sectionName = sectionMap.get(st.section_id) || "";
    const isInfoComplete = Boolean(st.full_name?.trim()) && Boolean(st.admission_number?.trim())
      && (st.roll_number != null || Boolean(st.date_of_birth)) && hasPhoto;
    if (isInfoComplete) complete++;
    return {
      id: st.id,
      admissionNumber: st.admission_number,
      fullName: st.full_name,
      fatherName: st.father_name || "",
      motherName: st.mother_name || "",
      parentEmail: st.parent_email || "",
      dob: st.date_of_birth || "",
      gender: st.gender || "",
      classId: st.class_id || "",
      className,
      sectionId: st.section_id || "",
      sectionName,
      classSection: sectionName ? `${className} - ${sectionName}` : className,
      rollNumber: st.roll_number || null,
      address: st.address || "",
      avatarUrl: st.avatar_url || null,
      bloodGroup: st.blood_group || "",
      emergencyContact: phoneMap.get(st.id) || st.emergency_contact || school.contact_number || "",
      hasPhoto,
      isInfoComplete,
      status: st.status || "active",
    };
  });
  const total = enriched.length;
  return {
    school: {
      id: school.id,
      name: school.name,
      logoUrl: school.logo_url || null,
      address: school.address || "",
      contactNumber: school.contact_number || "",
      email: school.email || "",
      academicYear: school.academic_year || "",
      idCardTemplateUrl: school.id_card_template_url || null,
      idCardConfig: school.id_card_config || null,
    },
    students: enriched,
    classes: classes ?? [],
    sections: sections ?? [],
    metrics: {
      totalStudents: total,
      withPhotoCount: withPhoto,
      missingPhotoCount: total - withPhoto,
      photoCompletenessPct: total ? Math.round((withPhoto / total) * 100) : 0,
      completeInfoCount: complete,
      incompleteInfoCount: total - complete,
      infoCompletenessPct: total ? Math.round((complete / total) * 100) : 0,
    },
  };
}
