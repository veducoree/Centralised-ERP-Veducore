// Razorpay payments for school fees.
//
// Actions (POST JSON { action, ... }, caller's JWT required):
//   gateway_save    admin saves Razorpay key id + secret (validated with Razorpay first)
//   gateway_disable admin turns online payments off
//   create          start a payment: channel "checkout" (web, Razorpay Checkout)
//                   or "link" (mobile app, Razorpay payment link)
//   verify          web checkout success: check signature, confirm with Razorpay, apply
//   check           ask Razorpay whether a payment finished (app return / retries), apply
//   reconcile       check every unfinished payment the caller can see (last 72h), apply paid ones
//
// Money is always computed here in paise; nothing from the client is trusted:
//   fee + 2% convenience fee + 18% GST on the convenience fee.
// Everything is collected into the school's own Razorpay account.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const RZP = "https://api.razorpay.com/v1";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function breakdown(feePaise: number) {
  const convenience = Math.round(feePaise * 0.02);
  const gst = Math.round(convenience * 0.18);
  return { fee: feePaise, convenience, gst, total: feePaise + convenience + gst };
}

async function rzp(keyId: string, secret: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${RZP}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${keyId}:${secret}`), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

interface Caller { id: string; role: string; school_id: string; staff_role_id: string | null; email: string | null }

async function canManageFees(admin: SupabaseClient, c: Caller, modules: string[]) {
  if (c.role !== "admin") return false;
  if (!c.staff_role_id) return true;
  const { data } = await admin.from("staff_roles").select("permissions").eq("id", c.staff_role_id).maybeSingle();
  const perms = (data?.permissions ?? {}) as Record<string, string>;
  return modules.some((m) => perms[m] === "edit");
}

async function getGateway(admin: SupabaseClient, schoolId: string) {
  const { data } = await admin.from("payment_gateways").select("*").eq("school_id", schoolId).maybeSingle();
  if (!data || !data.is_active) throw new HttpError(400, "Online payment is not enabled for this school yet.");
  return data as { key_id: string; key_secret: string };
}

/** May the caller see/pay for this payment's student? */
async function assertCanPay(admin: SupabaseClient, c: Caller, studentId: string, schoolId: string) {
  if (c.school_id !== schoolId) throw new HttpError(403, "Not allowed");
  if (c.role === "parent") {
    const { data } = await admin.from("parent_students").select("id, parent:parents!inner(user_id)")
      .eq("student_id", studentId).eq("parent.user_id", c.id).limit(1);
    if (!data?.length) throw new HttpError(403, "This student is not linked to your account");
    return;
  }
  if (!(await canManageFees(admin, c, ["fees", "admissions"]))) throw new HttpError(403, "Your role cannot collect fees");
}

async function apply(admin: SupabaseClient, paymentId: string, rzpPaymentId: string) {
  const { data, error } = await admin.rpc("apply_online_payment", { p_id: paymentId, p_razorpay_payment_id: rzpPaymentId });
  if (error) throw new HttpError(500, "Payment received but could not be recorded: " + error.message);
  return data;
}

/** Confirms a Razorpay payment belongs to this checkout and is captured (captures if authorized). */
async function confirmPayment(gw: { key_id: string; key_secret: string }, row: Record<string, unknown>, rzpPaymentId: string) {
  const p = await rzp(gw.key_id, gw.key_secret, `/payments/${encodeURIComponent(rzpPaymentId)}`);
  if (!p.ok) throw new HttpError(400, "Could not confirm the payment with Razorpay");
  const pay = p.body as { status: string; amount: number; order_id?: string; currency: string };
  if (Number(pay.amount) !== Number(row.total_amount) || pay.currency !== "INR") throw new HttpError(400, "Payment amount does not match");
  if (row.razorpay_order_id && pay.order_id && pay.order_id !== row.razorpay_order_id) throw new HttpError(400, "Payment is for a different order");
  if (pay.status === "authorized") {
    const cap = await rzp(gw.key_id, gw.key_secret, `/payments/${encodeURIComponent(rzpPaymentId)}/capture`, {
      method: "POST", body: JSON.stringify({ amount: pay.amount, currency: "INR" }),
    });
    if (!cap.ok) throw new HttpError(400, "Payment could not be captured");
  } else if (pay.status !== "captured") {
    throw new HttpError(400, `Payment is ${pay.status}`);
  }
}

/** Asks Razorpay about one unfinished payment; applies it when paid. */
async function checkRow(admin: SupabaseClient, gw: { key_id: string; key_secret: string }, row: Record<string, unknown>) {
  if (row.status === "paid") return { status: "paid" as const, row };
  let payId: string | null = null;
  if (row.razorpay_order_id) {
    const r = await rzp(gw.key_id, gw.key_secret, `/orders/${row.razorpay_order_id}/payments`);
    const items = (r.body?.items ?? []) as { id: string; status: string }[];
    payId = items.find((p) => p.status === "captured")?.id ?? items.find((p) => p.status === "authorized")?.id ?? null;
  } else if (row.razorpay_link_id) {
    const r = await rzp(gw.key_id, gw.key_secret, `/payment_links/${row.razorpay_link_id}`);
    const link = r.body as { status?: string; payments?: { payment_id: string; status: string }[] };
    payId = link.payments?.find((p) => p.status === "captured")?.payment_id ?? null;
    if (!payId && (link.status === "expired" || link.status === "cancelled")) {
      await admin.from("online_payments").update({ status: "expired" }).eq("id", row.id).eq("status", "created");
      return { status: "expired" as const, row };
    }
  }
  if (!payId) return { status: "pending" as const, row };
  await confirmPayment(gw, row, payId);
  const applied = await apply(admin, String(row.id), payId);
  return { status: "paid" as const, row: applied };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const { data: prof } = await admin.from("profiles").select("role, school_id, status, staff_role_id").eq("id", u.user.id).maybeSingle();
    if (!prof || prof.status !== "active" || !prof.school_id) return json({ error: "Forbidden" }, 403);
    const caller: Caller = { id: u.user.id, role: prof.role, school_id: prof.school_id, staff_role_id: prof.staff_role_id, email: u.user.email ?? null };

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // ── Admin: save / disable gateway ─────────────────────────────────────
    if (action === "gateway_save") {
      if (!(await canManageFees(admin, caller, ["fees", "settings"]))) throw new HttpError(403, "Your role cannot change payment settings");
      const keyId = String(body.key_id ?? "").trim();
      const secret = String(body.key_secret ?? "").trim();
      if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) throw new HttpError(400, "Key ID must look like rzp_live_… or rzp_test_…");
      if (secret.length < 10) throw new HttpError(400, "Enter the Key Secret from the Razorpay dashboard");
      // Validate the pair with Razorpay before activating.
      const probe = await rzp(keyId, secret, "/orders?count=1");
      if (probe.status === 401) throw new HttpError(400, "Razorpay rejected these keys. Check the Key ID and Secret.");
      if (!probe.ok) throw new HttpError(400, "Could not reach Razorpay to verify the keys. Try again.");
      const { error } = await admin.from("payment_gateways").upsert({
        school_id: caller.school_id, key_id: keyId, key_secret: secret, is_active: true,
        verified_at: new Date().toISOString(), updated_by: caller.id, updated_at: new Date().toISOString(),
      }, { onConflict: "school_id" });
      if (error) throw new HttpError(500, error.message);
      return json({ active: true, mode: keyId.startsWith("rzp_live_") ? "live" : "test", key_hint: "rzp_…" + keyId.slice(-4) });
    }
    if (action === "gateway_disable") {
      if (!(await canManageFees(admin, caller, ["fees", "settings"]))) throw new HttpError(403, "Your role cannot change payment settings");
      await admin.from("payment_gateways").update({ is_active: false, updated_by: caller.id, updated_at: new Date().toISOString() }).eq("school_id", caller.school_id);
      return json({ active: false });
    }

    // ── Create a payment ──────────────────────────────────────────────────
    if (action === "create") {
      const channel = body.channel === "link" ? "link" : "checkout";
      const allocIn = Array.isArray(body.allocations) ? body.allocations : [];
      if (!allocIn.length || allocIn.length > 20) throw new HttpError(400, "Nothing to pay");
      const feeIds = [...new Set(allocIn.map((a: { fee_id: string }) => String(a.fee_id)))];
      const { data: fees } = await admin.from("fees").select("id, school_id, student_id, amount, paid_amount, fee_type").in("id", feeIds);
      if (!fees || fees.length !== feeIds.length) throw new HttpError(400, "Fee not found");
      const studentId = fees[0].student_id;
      if (fees.some((f) => f.student_id !== studentId || f.school_id !== caller.school_id)) throw new HttpError(400, "All fees must belong to one student of your school");
      await assertCanPay(admin, caller, studentId, caller.school_id);

      const allocations = allocIn.map((a: { fee_id: string; amount: number }) => {
        const fee = fees.find((f) => f.id === a.fee_id)!;
        const paise = Math.round(Number(a.amount) * 100);
        const remaining = Math.round((Number(fee.amount) - Number(fee.paid_amount)) * 100);
        if (!(paise > 0)) throw new HttpError(400, "Amount must be more than zero");
        if (paise > remaining) throw new HttpError(400, `${fee.fee_type}: amount is more than the balance due`);
        return { fee_id: fee.id, amount: paise };
      });
      const feePaise = allocations.reduce((s: number, a: { amount: number }) => s + a.amount, 0);
      if (feePaise < 100) throw new HttpError(400, "Minimum online payment is ₹1");
      const b = breakdown(feePaise);
      const gw = await getGateway(admin, caller.school_id);

      // Same fees, same amount, still open (< 20 min)? Reuse it so a double
      // tap or a second tab can't charge twice — an order is payable once.
      const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const { data: open } = await admin.from("online_payments").select("*")
        .eq("student_id", studentId).eq("status", "created").eq("channel", channel).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(5);
      const sameAlloc = (x: unknown) => JSON.stringify([...(x as { fee_id: string; amount: number }[])].sort((a, b) => a.fee_id.localeCompare(b.fee_id)))
        === JSON.stringify([...allocations].sort((a: { fee_id: string }, b: { fee_id: string }) => a.fee_id.localeCompare(b.fee_id)));
      const reuse = (open ?? []).find((o) => sameAlloc(o.allocations) && (o.razorpay_order_id || o.link_url));
      if (reuse) {
        const c = await checkRow(admin, gw, reuse);
        if (c.status === "paid") throw new HttpError(409, "This fee was just paid. Refresh to see the receipt.");
        if (c.status === "pending") {
          const { data: st } = await admin.from("students").select("full_name, admission_number").eq("id", studentId).maybeSingle();
          return json({
            online_payment_id: reuse.id, key_id: gw.key_id,
            order_id: reuse.razorpay_order_id ?? null, link_url: reuse.link_url ?? null,
            amount: Number(reuse.total_amount),
            breakdown: { fee: Number(reuse.fee_amount), convenience: Number(reuse.convenience_fee), gst: Number(reuse.gst_amount), total: Number(reuse.total_amount) },
            description: `Fees: ${st?.full_name ?? "Student"} (${st?.admission_number ?? ""})`,
          });
        }
      }

      // Admission receipt must be this student's.
      let admissionReceiptId: string | null = null;
      if (body.admission_receipt_id) {
        const { data: ar } = await admin.from("admission_receipts").select("id").eq("id", body.admission_receipt_id).eq("student_id", studentId).maybeSingle();
        admissionReceiptId = ar?.id ?? null;
      }

      const id = crypto.randomUUID();
      const { error: insErr } = await admin.from("online_payments").insert({
        id, school_id: caller.school_id, student_id: studentId, initiated_by: caller.id, channel,
        allocations, next_due_dates: typeof body.next_due_dates === "object" && body.next_due_dates ? body.next_due_dates : {},
        admission_receipt_id: admissionReceiptId,
        fee_amount: b.fee, convenience_fee: b.convenience, gst_amount: b.gst, total_amount: b.total,
      });
      if (insErr) throw new HttpError(500, insErr.message);

      const { data: student } = await admin.from("students").select("full_name, admission_number").eq("id", studentId).maybeSingle();
      const description = `Fees: ${student?.full_name ?? "Student"} (${student?.admission_number ?? ""})`.slice(0, 250);
      const notes = { online_payment_id: id, school_id: caller.school_id, student_id: studentId };
      let update: Record<string, unknown> = {};
      if (channel === "checkout") {
        const r = await rzp(gw.key_id, gw.key_secret, "/orders", {
          method: "POST",
          body: JSON.stringify({ amount: b.total, currency: "INR", receipt: `vdc_${id.slice(0, 30)}`, notes, payment_capture: 1 }),
        });
        if (!r.ok) {
          await admin.from("online_payments").update({ status: "failed", error: JSON.stringify(r.body).slice(0, 500) }).eq("id", id);
          throw new HttpError(502, "Razorpay could not start the payment. Try again.");
        }
        update = { razorpay_order_id: r.body.id };
      } else {
        const r = await rzp(gw.key_id, gw.key_secret, "/payment_links", {
          method: "POST",
          body: JSON.stringify({
            amount: b.total, currency: "INR", description, reference_id: id.slice(0, 40), notes,
            expire_by: Math.floor(Date.now() / 1000) + 30 * 60,
            reminder_enable: false, notify: { sms: false, email: false },
            // Login usernames map to placeholder addresses (…@veducore.internal); send only real emails.
            customer: caller.email && !/\.(internal|veducore)$/i.test(caller.email) ? { email: caller.email } : undefined,
          }),
        });
        if (!r.ok) {
          await admin.from("online_payments").update({ status: "failed", error: JSON.stringify(r.body).slice(0, 500) }).eq("id", id);
          throw new HttpError(502, "Razorpay could not start the payment. Try again.");
        }
        update = { razorpay_link_id: r.body.id, link_url: r.body.short_url };
      }
      await admin.from("online_payments").update(update).eq("id", id);

      return json({
        online_payment_id: id,
        key_id: gw.key_id,
        order_id: update.razorpay_order_id ?? null,
        link_url: update.link_url ?? null,
        amount: b.total,
        breakdown: { fee: b.fee, convenience: b.convenience, gst: b.gst, total: b.total },
        description,
      });
    }

    // ── Verify / check ────────────────────────────────────────────────────
    if (action === "verify" || action === "check") {
      const { data: row } = await admin.from("online_payments").select("*").eq("id", body.online_payment_id).maybeSingle();
      if (!row) throw new HttpError(404, "Payment not found");
      await assertCanPay(admin, caller, row.student_id, row.school_id);
      if (row.status === "paid") return json({ status: "paid", receipt_number: row.receipt_number, payment: row });
      const gw = await getGateway(admin, row.school_id);

      if (action === "verify") {
        const orderId = String(body.razorpay_order_id ?? "");
        const payId = String(body.razorpay_payment_id ?? "");
        const sig = String(body.razorpay_signature ?? "");
        if (!orderId || orderId !== row.razorpay_order_id) throw new HttpError(400, "Order mismatch");
        const expected = await hmacHex(gw.key_secret, `${orderId}|${payId}`);
        if (!safeEqual(expected, sig)) throw new HttpError(400, "Payment signature is invalid");
        await confirmPayment(gw, row, payId);
        const applied = await apply(admin, row.id, payId);
        return json({ status: "paid", receipt_number: applied?.receipt_number, payment: applied });
      }

      const c = await checkRow(admin, gw, row);
      return json({ status: c.status, receipt_number: (c.row as { receipt_number?: string })?.receipt_number, payment: c.row });
    }

    // ── Reconcile everything unfinished the caller can see ────────────────
    if (action === "reconcile") {
      const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
      let q = admin.from("online_payments").select("*").eq("school_id", caller.school_id).eq("status", "created").gte("created_at", since)
        .order("created_at", { ascending: false }).limit(25);
      if (caller.role === "parent") {
        const { data: links } = await admin.from("parent_students").select("student_id, parent:parents!inner(user_id)").eq("parent.user_id", caller.id);
        const ids = (links ?? []).map((l) => l.student_id);
        if (!ids.length) return json({ applied: 0, pending: 0 });
        q = q.in("student_id", ids);
      } else if (!(await canManageFees(admin, caller, ["fees", "admissions"]))) {
        throw new HttpError(403, "Not allowed");
      }
      const { data: rows } = await q;
      if (!rows?.length) return json({ applied: 0, pending: 0 });
      const { data: gwRow } = await admin.from("payment_gateways").select("*").eq("school_id", caller.school_id).maybeSingle();
      if (!gwRow) return json({ applied: 0, pending: rows.length });
      let applied = 0, pending = 0;
      for (const r of rows) {
        try {
          const c = await checkRow(admin, gwRow, r);
          if (c.status === "paid") applied++; else if (c.status === "pending") pending++;
        } catch (e) {
          await admin.from("online_payments").update({ error: String(e instanceof Error ? e.message : e).slice(0, 300) }).eq("id", r.id);
        }
      }
      return json({ applied, pending });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("payments error", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
