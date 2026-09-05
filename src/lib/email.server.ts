/**
 * KAIVRA investor email engine (server-only).
 *
 * Architecture: Lovable (development) -> GitHub -> Cloudflare Worker ->
 * kaivraa.com -> Resend -> investor. Resend is called over plain HTTPS, so the
 * whole pipeline works inside the Worker runtime and depends on no Lovable
 * hosting or Lovable email infrastructure.
 *
 * Safety model:
 *  - EMAIL_TEST_MODE (default ON) redirects EVERY message to
 *    EMAIL_TEST_RECIPIENT and prefixes the subject with the intended address.
 *    No investor can be contacted until it is explicitly turned off.
 *  - Every message is queued in `public.email_outbox` with a unique dedupe key,
 *    so retries and repeated cron runs can never double-send.
 *  - Transactional messages ignore marketing preferences; marketing messages
 *    are only ever delivered to users who are opted in.
 */

import { renderTemplate, type EmailCategory } from "@/lib/email-templates.server";

export type EmailConfig = {
  configured: boolean;
  testMode: boolean;
  testRecipient: string | null;
  from: string;
  replyTo: string | null;
  siteUrl: string;
};

const DEFAULT_FROM = "KAIVRA <notifications@kaivraa.com>";

export function emailConfig(): EmailConfig {
  const env = typeof process !== "undefined" ? process.env : ({} as Record<string, string>);
  // Test mode is ON unless explicitly disabled — fail safe, never fail loud.
  const raw = (env["EMAIL_TEST_MODE"] ?? "true").toString().trim().toLowerCase();
  const testMode = !["false", "0", "off", "no"].includes(raw);
  return {
    configured: Boolean(env["RESEND_API_KEY"]),
    testMode,
    testRecipient: env["EMAIL_TEST_RECIPIENT"]?.trim() || null,
    from: env["EMAIL_FROM"]?.trim() || DEFAULT_FROM,
    replyTo: env["EMAIL_REPLY_TO"]?.trim() || null,
    siteUrl: env["PUBLIC_SITE_URL"]?.trim() || "https://kaivraa.com",
  };
}

function maskEmail(value: string) {
  const [user, domain] = value.split("@");
  if (!domain) return "***";
  return `${(user ?? "").slice(0, 2)}***@${domain}`;
}

export function safeConfigSummary() {
  const cfg = emailConfig();
  return {
    configured: cfg.configured,
    testMode: cfg.testMode,
    testRecipient: cfg.testRecipient ? maskEmail(cfg.testRecipient) : null,
    from: cfg.from,
    replyTo: cfg.replyTo,
  };
}

type SendResult =
  | { ok: true; providerId: string | null; deliveredTo: string; skipped?: false }
  | { ok: false; error: string };

/** Low-level Resend call. Never throws; returns a structured result. */
async function sendViaResend(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
}): Promise<SendResult> {
  const cfg = emailConfig();
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return { ok: false, error: "Email provider is not configured." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: cfg.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ?? cfg.replyTo ? { reply_to: input.replyTo ?? cfg.replyTo } : {}),
      }),
    });
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) {
      console.error("[email] provider rejected message", res.status, body?.message);
      return { ok: false, error: `Provider error ${res.status}: ${body?.message ?? "unknown"}` };
    }
    return { ok: true, providerId: body?.id ?? null, deliveredTo: input.to };
  } catch (err) {
    console.error("[email] provider request failed", err);
    return { ok: false, error: "Provider request failed." };
  }
}

/**
 * Applies test-mode routing then sends.
 * In test mode the real recipient is never contacted.
 */
export async function deliver(input: {
  intendedTo: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const cfg = emailConfig();
  if (cfg.testMode) {
    if (!cfg.testRecipient) {
      return { ok: false, error: "Test mode is on but no test recipient is configured." };
    }
    return sendViaResend({
      to: cfg.testRecipient,
      subject: `[TEST → ${input.intendedTo}] ${input.subject}`,
      html: input.html,
      text: `[TEST MODE — intended recipient: ${input.intendedTo}]\n\n${input.text}`,
    });
  }
  return sendViaResend({ ...input, to: input.intendedTo });
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function enqueue(rows: {
  kind: string;
  category: EmailCategory;
  recipient_email: string | null;
  recipient_user_id?: string | null;
  subject?: string | null;
  payload: Record<string, unknown>;
  dedupe_key: string;
}[]) {
  if (rows.length === 0) return 0;
  const db = await admin();
  const { data, error } = await db
    .from("email_outbox")
    .upsert(
      rows.map((r) => ({ ...r, test_mode: emailConfig().testMode })),
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    console.error("[email] enqueue failed", error);
    throw new Error("Emails could not be queued.");
  }
  return (data ?? []).length;
}

/** Unsubscribe token for a user, created on demand. */
async function unsubscribeUrlFor(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const db = await admin();
  const { data } = await db
    .from("email_preferences")
    .select("unsubscribe_token")
    .eq("user_id", userId)
    .maybeSingle();
  let token = data?.unsubscribe_token as string | undefined;
  if (!token) {
    const { data: created } = await db
      .from("email_preferences")
      .upsert({ user_id: userId }, { onConflict: "user_id" })
      .select("unsubscribe_token")
      .maybeSingle();
    token = created?.unsubscribe_token;
  }
  return token ? `${emailConfig().siteUrl}/unsubscribe?token=${token}` : null;
}

/** True when a marketing message may be delivered to this user. */
async function marketingAllowed(userId: string | null) {
  if (!userId) return false;
  const db = await admin();
  const { data } = await db
    .from("email_preferences")
    .select("marketing_opt_in")
    .eq("user_id", userId)
    .maybeSingle();
  // No row yet = opted in by default (matches the table default).
  return data ? Boolean(data.marketing_opt_in) : true;
}

/**
 * Expands a broadcast row (recipient_email IS NULL) into one queued row per
 * eligible, opted-in investor.
 */
async function expandBroadcast(row: any) {
  const db = await admin();
  const { data: prefs } = await db
    .from("email_preferences")
    .select("user_id, marketing_opt_in");
  const optedOut = new Set(
    ((prefs ?? []) as any[]).filter((p) => !p.marketing_opt_in).map((p) => p.user_id),
  );
  // Marketing goes to investors only — staff roles are excluded so partner /
  // adviser / super-admin activity is never revealed through mailing lists.
  const { data: staff } = await db
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "super_admin", "adviser", "partner"]);
  const staffIds = new Set(((staff ?? []) as any[]).map((s) => s.user_id));

  const { data: profiles } = await db.from("profiles").select("id, email, full_name");
  const recipients = ((profiles ?? []) as any[]).filter(
    (p) => p.email && !optedOut.has(p.id) && !staffIds.has(p.id),
  );

  await enqueue(
    recipients.map((p) => ({
      kind: row.kind,
      category: "marketing" as const,
      recipient_email: String(p.email).toLowerCase(),
      recipient_user_id: p.id,
      payload: { ...row.payload, full_name: p.full_name ?? "" },
      dedupe_key: `${row.dedupe_key}:${p.id}`,
    })),
  );

  await db
    .from("email_outbox")
    .update({ status: "expanded", sent_at: new Date().toISOString() })
    .eq("id", row.id);
  return recipients.length;
}

export type ProcessResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  expanded: number;
  testMode: boolean;
};

/** Sends up to `limit` pending messages. Safe to call repeatedly. */
export async function processQueue(limit = 40): Promise<ProcessResult> {
  const cfg = emailConfig();
  const db = await admin();
  const result: ProcessResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    expanded: 0,
    testMode: cfg.testMode,
  };

  const { data: rows, error } = await db
    .from("email_outbox")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error("The email queue could not be read.");

  for (const row of (rows ?? []) as any[]) {
    result.processed += 1;

    if (!row.recipient_email) {
      result.expanded += await expandBroadcast(row);
      continue;
    }

    if (row.category === "marketing" && !(await marketingAllowed(row.recipient_user_id))) {
      await db
        .from("email_outbox")
        .update({ status: "skipped", last_error: "Recipient opted out of marketing email." })
        .eq("id", row.id);
      result.skipped += 1;
      continue;
    }

    const unsubscribeUrl =
      row.category === "marketing" ? await unsubscribeUrlFor(row.recipient_user_id) : null;
    const rendered = renderTemplate(row.kind, row.payload ?? {}, { unsubscribeUrl });
    const outcome = await deliver({
      intendedTo: row.recipient_email,
      subject: row.subject || rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (outcome.ok) {
      await db
        .from("email_outbox")
        .update({
          status: "sent",
          subject: row.subject || rendered.subject,
          sent_at: new Date().toISOString(),
          attempts: (row.attempts ?? 0) + 1,
          provider_message_id: outcome.providerId,
          delivered_to: outcome.deliveredTo,
          test_mode: cfg.testMode,
          last_error: null,
        })
        .eq("id", row.id);
      result.sent += 1;
    } else {
      const attempts = (row.attempts ?? 0) + 1;
      await db
        .from("email_outbox")
        .update({
          // Give up after 5 attempts so a bad address cannot loop forever.
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          last_error: outcome.error.slice(0, 500),
          scheduled_for: new Date(Date.now() + attempts * 15 * 60 * 1000).toISOString(),
        })
        .eq("id", row.id);
      result.failed += 1;
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Payment reminders                                                   */
/* ------------------------------------------------------------------ */

function isoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Scans existing applications and payments for outstanding balances and
 * queues at most one reminder per application per ISO week.
 */
export async function scanPaymentReminders(): Promise<{ queued: number; considered: number }> {
  const db = await admin();
  const { data: apps } = await db
    .from("applications")
    .select(
      "id, reference, partner_reference, investor_id, status, contact, personal, investment, negotiated_price, standard_price, projects(currency), properties(name, unit_price)",
    )
    .in("status", ["submitted", "under_review", "payment_verification", "approved"]);

  const queue: Parameters<typeof enqueue>[0] = [];
  const week = isoWeek();
  for (const app of (apps ?? []) as any[]) {
    const total =
      Number(app.negotiated_price ?? 0) ||
      Number(app.investment?.total_value ?? 0) ||
      Number(app.properties?.unit_price ?? 0);
    if (!total) continue;

    const { data: payments } = await db
      .from("application_payments")
      .select("amount, status, paid_on, created_at")
      .eq("application_id", app.id);
    const verified = ((payments ?? []) as any[]).filter((p) => p.status === "verified");
    const paid = verified.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const outstanding = total - paid;
    if (outstanding <= 0) continue;

    const lastPaidAt = verified
      .map((p) => new Date(p.paid_on ?? p.created_at).getTime())
      .sort((a, b) => b - a)[0];
    const daysSince = lastPaidAt ? (Date.now() - lastPaidAt) / 86400000 : Infinity;
    // Nudge monthly; treat >60 days without a verified payment as overdue.
    if (daysSince < 30) continue;

    const email = String(app.contact?.email ?? "").trim().toLowerCase();
    if (!email) continue;

    queue.push({
      kind: "payment_reminder",
      category: "transactional",
      recipient_email: email,
      recipient_user_id: app.investor_id ?? null,
      payload: {
        application_id: app.id,
        reference: app.partner_reference ?? app.reference,
        full_name: app.personal?.full_name ?? "",
        property_name: app.properties?.name ?? "",
        currency: app.projects?.currency ?? "NGN",
        total,
        paid,
        outstanding,
        overdue: daysSince > 60,
        last_payment: lastPaidAt ? new Date(lastPaidAt).toDateString() : null,
      },
      dedupe_key: `payment_reminder:${app.id}:${week}`,
    });
  }

  const queued = await enqueue(queue);
  return { queued, considered: (apps ?? []).length };
}

/* ------------------------------------------------------------------ */
/* Unsubscribe                                                         */
/* ------------------------------------------------------------------ */

export async function unsubscribeByToken(token: string) {
  const db = await admin();
  const { data, error } = await db
    .from("email_preferences")
    .update({ marketing_opt_in: false })
    .eq("unsubscribe_token", token)
    .select("user_id")
    .maybeSingle();
  if (error) throw new Error("Your preference could not be updated.");
  return { ok: Boolean(data) };
}
