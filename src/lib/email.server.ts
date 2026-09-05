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

/**
 * Marketing preference category for a message kind. `marketing_opt_in` is the
 * master switch; each category can also be turned off on its own.
 */
export function marketingCategoryFor(kind: string): string {
  switch (kind) {
    case "new_listing":
    case "price_change":
      return "new_property_opt_in";
    case "promotion":
      return "promotions_opt_in";
    default:
      return "campaigns_opt_in";
  }
}

/** True when a marketing message of this kind may be delivered to this user. */
async function marketingAllowed(userId: string | null, kind: string) {
  if (!userId) return false;
  const db = await admin();
  const column = marketingCategoryFor(kind);
  const { data } = await db
    .from("email_preferences")
    .select(`marketing_opt_in, ${column}`)
    .eq("user_id", userId)
    .maybeSingle();
  // No row yet = opted in by default (matches the table defaults).
  if (!data) return true;
  return Boolean(data.marketing_opt_in) && Boolean((data as any)[column]);
}

/** User ids of every privileged / staff account. */
export async function staffUserIds(): Promise<Set<string>> {
  const db = await admin();
  const { data } = await db
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "super_admin", "adviser", "partner"]);
  return new Set(((data ?? []) as any[]).map((s) => s.user_id));
}

/**
 * Expands a broadcast row (recipient_email IS NULL) into one queued row per
 * eligible, opted-in investor.
 */
async function expandBroadcast(row: any) {
  const db = await admin();
  const column = marketingCategoryFor(row.kind);
  const { data: prefs } = await db
    .from("email_preferences")
    .select(`user_id, marketing_opt_in, ${column}`);
  const optedOut = new Set(
    ((prefs ?? []) as any[])
      .filter((p) => !p.marketing_opt_in || !p[column])
      .map((p) => p.user_id),
  );
  // Marketing goes to investors only — staff roles are excluded so partner /
  // adviser / super-admin activity is never revealed through mailing lists.
  const staffIds = await staffUserIds();

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

    if (
      row.category === "marketing" &&
      !(await marketingAllowed(row.recipient_user_id, row.kind))
    ) {
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
/* Payment reminders — driven by real installment due dates            */
/* ------------------------------------------------------------------ */

/** Days-before-due milestones and their idempotency suffixes. */
const BEFORE_DUE: Record<number, string> = {
  14: "14_DAY",
  7: "7_DAY",
  3: "3_DAY",
  1: "1_DAY",
  0: "DUE_DATE",
};

/**
 * Overdue milestone for a given number of days past due:
 * 1, 3, 7 and then every 7 days while a balance remains.
 */
function overdueMilestone(days: number): string | null {
  if (days === 1) return "1_DAY";
  if (days === 3) return "3_DAY";
  if (days >= 7 && days % 7 === 0) return `${days}_DAY`;
  return null;
}

const ACTIVE_APPLICATION_STATUSES = [
  "submitted",
  "under_review",
  "payment_verification",
  "approved",
];

function todayUtc() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function daysBetween(dueDate: string) {
  const [y, m, d] = dueDate.split("-").map(Number);
  return Math.round((Date.UTC(y!, (m ?? 1) - 1, d ?? 1) - todayUtc()) / 86400000);
}

/**
 * Scans real installment obligations and queues exactly the reminder that is
 * due today for each one. Every message carries a deterministic idempotency
 * key, and the outbox enforces it at database level, so repeated, concurrent
 * or retried runs can never send twice.
 */
export async function scanPaymentReminders(): Promise<{
  queued: number;
  considered: number;
  skipped: number;
}> {
  const db = await admin();
  const staffIds = await staffUserIds();

  const { data: installments } = await db
    .from("application_installments")
    .select("id, application_id, sequence, label, amount_due, due_date, status")
    .eq("status", "scheduled")
    .order("sequence", { ascending: true });

  const rows = (installments ?? []) as any[];
  if (rows.length === 0) return { queued: 0, considered: 0, skipped: 0 };

  const appIds = Array.from(new Set(rows.map((i) => i.application_id)));
  const { data: apps } = await db
    .from("applications")
    .select(
      "id, reference, partner_reference, investor_id, status, application_type, contact, personal, projects(currency), properties(name)",
    )
    .in("id", appIds);
  const appById = new Map(((apps ?? []) as any[]).map((a) => [a.id, a]));

  const { data: payments } = await db
    .from("application_payments")
    .select("application_id, amount, status")
    .in("application_id", appIds)
    .eq("status", "verified");
  const paidByApp = new Map<string, number>();
  for (const p of ((payments ?? []) as any[])) {
    paidByApp.set(p.application_id, (paidByApp.get(p.application_id) ?? 0) + Number(p.amount ?? 0));
  }

  // Allocate verified payments across installments in due order — the single
  // existing payment record set stays the source of truth; nothing is written.
  const byApp = new Map<string, any[]>();
  for (const inst of rows) {
    const list = byApp.get(inst.application_id) ?? [];
    list.push(inst);
    byApp.set(inst.application_id, list);
  }

  const queue: Parameters<typeof enqueue>[0] = [];
  let considered = 0;
  let skipped = 0;

  for (const [appId, list] of byApp) {
    const app = appById.get(appId);
    if (!app) continue;

    // --- Eligibility -------------------------------------------------
    if (!ACTIVE_APPLICATION_STATUSES.includes(app.status)) {
      skipped += list.length;
      continue;
    }
    const isPartnerPurchase = app.application_type === "partner";
    // A privileged account is only a customer through the partner-purchase
    // workflow; it never receives ordinary investor payment reminders.
    if (staffIds.has(app.investor_id) && !isPartnerPurchase) {
      skipped += list.length;
      continue;
    }
    const email = String(app.contact?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      skipped += list.length;
      continue;
    }

    let remaining = paidByApp.get(appId) ?? 0;
    const ordered = [...list].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

    for (const inst of ordered) {
      considered += 1;
      const amountDue = Number(inst.amount_due ?? 0);
      const allocated = Math.min(remaining, amountDue);
      remaining -= allocated;
      const outstanding = amountDue - allocated;
      if (outstanding <= 0) continue; // fully paid — nothing to chase

      const diff = daysBetween(String(inst.due_date));
      let suffix: string | null = null;
      let overdue = false;
      if (diff >= 0) {
        suffix = BEFORE_DUE[diff] ?? null;
      } else {
        suffix = overdueMilestone(Math.abs(diff));
        overdue = true;
      }
      if (!suffix) continue;

      queue.push({
        kind: "payment_reminder",
        category: "transactional",
        recipient_email: email,
        recipient_user_id: app.investor_id ?? null,
        payload: {
          application_id: appId,
          installment_id: inst.id,
          installment_label: inst.label,
          reference: app.partner_reference ?? app.reference,
          full_name: app.personal?.full_name ?? "",
          property_name: app.properties?.name ?? "",
          currency: app.projects?.currency ?? "NGN",
          due_date: String(inst.due_date),
          amount_due: amountDue,
          paid: allocated,
          outstanding,
          overdue,
          days: Math.abs(diff),
        },
        dedupe_key: `${overdue ? "PAYMENT_OVERDUE" : "PAYMENT_REMINDER"}:${appId}:${inst.id}:${suffix}`,
      });
    }
  }

  const queued = await enqueue(queue);
  return { queued, considered, skipped };
}

/* ------------------------------------------------------------------ */
/* Promotions                                                          */
/* ------------------------------------------------------------------ */

/** Resolves an audience into eligible investor recipients (never staff). */
export async function resolveAudience(
  audience: string,
  opts: { projectId?: string | null; propertyId?: string | null } = {},
): Promise<{ id: string | null; email: string; full_name: string }[]> {
  const db = await admin();
  const staffIds = await staffUserIds();

  if (audience === "opted_in_investors") {
    const { data: profiles } = await db.from("profiles").select("id, email, full_name");
    return ((profiles ?? []) as any[])
      .filter((p) => p.email && !staffIds.has(p.id))
      .map((p) => ({
        id: p.id,
        email: String(p.email).toLowerCase(),
        full_name: p.full_name ?? "",
      }));
  }

  let query = db
    .from("applications")
    .select("id, investor_id, contact, personal, investment, project_id, property_id, negotiated_price")
    .in("status", ACTIVE_APPLICATION_STATUSES);
  if (audience === "property_related") {
    if (opts.propertyId) query = query.eq("property_id", opts.propertyId);
    else if (opts.projectId) query = query.eq("project_id", opts.projectId);
  }
  const { data: apps } = await query;
  let list = (apps ?? []) as any[];

  if (audience === "outstanding_balance") {
    const ids = list.map((a) => a.id);
    const paid = new Map<string, number>();
    if (ids.length) {
      const { data: pays } = await db
        .from("application_payments")
        .select("application_id, amount, status")
        .in("application_id", ids)
        .eq("status", "verified");
      for (const p of ((pays ?? []) as any[])) {
        paid.set(p.application_id, (paid.get(p.application_id) ?? 0) + Number(p.amount ?? 0));
      }
    }
    list = list.filter((a) => {
      const total = Number(a.negotiated_price ?? 0) || Number(a.investment?.total_value ?? 0);
      return total > 0 && (paid.get(a.id) ?? 0) < total;
    });
  }

  const seen = new Set<string>();
  const targets: { id: string | null; email: string; full_name: string }[] = [];
  for (const app of list) {
    const email = String(app.contact?.email ?? "").trim().toLowerCase();
    if (!email || seen.has(email) || staffIds.has(app.investor_id)) continue;
    seen.add(email);
    targets.push({
      id: app.investor_id ?? null,
      email,
      full_name: app.personal?.full_name ?? "",
    });
  }
  return targets;
}

/**
 * Moves promotions through their lifecycle and queues the ones that have just
 * become active. Drafts and cancelled promotions never send. Queued rows carry
 * a deterministic key per promotion + recipient, so re-running is a no-op.
 */
export async function processPromotions(): Promise<{
  activated: number;
  expired: number;
  queued: number;
}> {
  const db = await admin();
  const now = new Date().toISOString();
  let activated = 0;
  let expired = 0;
  let queued = 0;

  // Scheduled -> Active once the start date arrives.
  const { data: due } = await db
    .from("promotions")
    .select("*")
    .eq("status", "scheduled")
    .or(`starts_at.is.null,starts_at.lte.${now}`);
  for (const promo of ((due ?? []) as any[])) {
    await db.from("promotions").update({ status: "active" }).eq("id", promo.id);
    activated += 1;
  }

  // Active promotions that have not been queued yet.
  const { data: active } = await db
    .from("promotions")
    .select("*")
    .eq("status", "active")
    .is("sent_at", null);
  for (const promo of ((active ?? []) as any[])) {
    const targets = await resolveAudience(promo.audience, {
      projectId: promo.project_id,
      propertyId: promo.property_id,
    });
    const count = await enqueue(
      targets.map((t) => ({
        kind: "promotion",
        category: "marketing" as const,
        recipient_email: t.email,
        recipient_user_id: t.id,
        subject: promo.subject,
        payload: {
          promotion_id: promo.id,
          title: promo.title,
          subject: promo.subject,
          description: promo.description,
          image_url: promo.image_url,
          cta_label: promo.cta_label,
          cta_url: promo.cta_url,
          full_name: t.full_name,
        },
        dedupe_key: `PROMOTION:${promo.id}:${t.id ?? t.email}`,
      })),
    );
    queued += count;
    await db
      .from("promotions")
      .update({ sent_at: new Date().toISOString(), queued_count: targets.length })
      .eq("id", promo.id);
  }

  // Active -> Expired once the end date passes.
  const { data: over } = await db
    .from("promotions")
    .select("id")
    .in("status", ["active", "scheduled"])
    .not("ends_at", "is", null)
    .lt("ends_at", now);
  for (const promo of ((over ?? []) as any[])) {
    await db.from("promotions").update({ status: "expired" }).eq("id", promo.id);
    expired += 1;
  }

  return { activated, expired, queued };
}


/* ------------------------------------------------------------------ */
/* Unsubscribe                                                         */
/* ------------------------------------------------------------------ */

export async function unsubscribeByToken(token: string) {
  const db = await admin();
  const { data, error } = await db
    .from("email_preferences")
    .update({
      marketing_opt_in: false,
      promotions_opt_in: false,
      new_property_opt_in: false,
      campaigns_opt_in: false,
    })
    .eq("unsubscribe_token", token)
    .select("user_id")
    .maybeSingle();
  if (error) throw new Error("Your preference could not be updated.");
  return { ok: Boolean(data) };
}
