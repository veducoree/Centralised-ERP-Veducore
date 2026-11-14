// Sends Expo push notifications for one `notifications` row.
//
// Called two ways (both safe to fire for the same row — the
// pending → sending transition is atomic, so only one call sends):
//   1. By the DB trigger through pg_net, with header x-dispatch-secret.
//   2. By the web/mobile client right after inserting, with the user's JWT.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, x-dispatch-secret",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { notification_id } = await req.json().catch(() => ({}));
    if (!notification_id) return json({ error: "notification_id required" }, 400);

    // --- Authorize ---------------------------------------------------
    const secret = req.headers.get("x-dispatch-secret");
    let authorized = !!dispatchSecret && secret === dispatchSecret;

    if (!authorized) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      // The caller must be able to see the row (RLS) and be staff.
      const { data: visible } = await userClient
        .from("notifications").select("id").eq("id", notification_id).maybeSingle();
      const { data: profile } = await admin
        .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
      authorized = !!visible && (profile?.role === "admin" || profile?.role === "teacher");
    }
    if (!authorized) return json({ error: "Forbidden" }, 403);

    // --- Claim the row --------------------------------------------------
    const { data: n } = await admin
      .from("notifications")
      .update({ push_status: "sending" })
      .eq("id", notification_id)
      .eq("push_status", "pending")
      .select("*")
      .maybeSingle();
    if (!n) return json({ skipped: true, reason: "already dispatched" });

    // --- Recipients -----------------------------------------------------
    const { data: recipients, error: recErr } = await admin.rpc("resolve_notification_recipients", {
      p_school: n.school_id,
      p_audience: n.audience,
      p_user: n.user_id,
      p_class: n.class_id,
      p_section: n.section_id,
      p_student: n.student_id,
    });
    if (recErr) throw recErr;
    let userIds = ((recipients ?? []) as unknown[]).map((r) =>
      typeof r === "string" ? r : (r as Record<string, string>).resolve_notification_recipients
    ).filter(Boolean);

    // Respect user preferences; urgent notices always go through.
    if (userIds.length && n.priority !== "urgent") {
      const { data: prefs } = await admin
        .from("notification_preferences")
        .select("user_id, muted_categories, push_enabled")
        .in("user_id", userIds);
      const blocked = new Set(
        (prefs ?? [])
          .filter((p) => !p.push_enabled || (p.muted_categories ?? []).includes(n.category))
          .map((p) => p.user_id),
      );
      userIds = userIds.filter((id) => !blocked.has(id));
    }

    if (!userIds.length) {
      await admin.from("notifications").update({ push_status: "skipped" }).eq("id", n.id);
      return json({ sent: 0 });
    }

    const tokenRows: { token: string; user_id: string }[] = [];
    for (let i = 0; i < userIds.length; i += 500) {
      const { data } = await admin
        .from("push_tokens").select("token, user_id").in("user_id", userIds.slice(i, i + 500));
      tokenRows.push(...(data ?? []));
    }

    if (!tokenRows.length) {
      await admin.from("notifications").update({ push_status: "skipped" }).eq("id", n.id);
      return json({ sent: 0 });
    }

    // --- Send -------------------------------------------------------------
    const channelId = n.priority === "normal" ? "default" : "important";
    let sent = 0;
    const dead: string[] = [];

    for (let i = 0; i < tokenRows.length; i += CHUNK) {
      const batch = tokenRows.slice(i, i + CHUNK);
      const messages = batch.map((t) => ({
        to: t.token,
        title: n.title,
        body: n.message,
        sound: "default",
        priority: n.priority === "normal" ? "default" : "high",
        channelId,
        data: {
          notification_id: n.id,
          category: n.category,
          link: n.link,
          student_id: n.student_id,
        },
      }));
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      });
      const out = await res.json().catch(() => ({}));
      const tickets = (out?.data ?? []) as { status: string; details?: { error?: string } }[];
      tickets.forEach((t, idx) => {
        if (t.status === "ok") sent++;
        else if (t.details?.error === "DeviceNotRegistered") dead.push(batch[idx].token);
      });
    }

    if (dead.length) await admin.from("push_tokens").delete().in("token", dead);

    await admin
      .from("notifications")
      .update({ push_status: sent > 0 ? "sent" : "failed", push_sent_count: sent })
      .eq("id", n.id);

    return json({ sent, devices: tokenRows.length, removed: dead.length });
  } catch (err) {
    console.error("push-dispatch error", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
