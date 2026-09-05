import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions for the KAIVRA investor email notification system.
 *
 * Authority: everything that can reach investor addresses, delivery logs or
 * announcements is STRICTLY Super Admin, re-derived from the database on every
 * call through the caller's own RLS-scoped client — no client claim, proxy
 * grant or payload can widen it. Investors may only read and change their own
 * marketing preference.
 */

const RESTRICTED = "Access restricted. Email notifications are a KAIVRA Super Admin function.";

type Caller = { supabase: any; userId: string };

async function requireSuperAdmin(context: Caller) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(RESTRICTED);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("super_admin")) throw new Error(RESTRICTED);
  return true;
}

/* -------------------------------------------------- Investor preferences */

export const getMyEmailPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Caller;
    const { data } = await supabase
      .from("email_preferences")
      .select("marketing_opt_in")
      .eq("user_id", userId)
      .maybeSingle();
    return { marketing_opt_in: data ? Boolean(data.marketing_opt_in) : true };
  });

export const setMyEmailPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ marketing_opt_in: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Caller;
    const { error } = await supabase
      .from("email_preferences")
      .upsert(
        { user_id: userId, marketing_opt_in: data.marketing_opt_in },
        { onConflict: "user_id" },
      );
    if (error) throw new Error("Your email preference could not be saved.");
    return { marketing_opt_in: data.marketing_opt_in };
  });

/* ------------------------------------------------------ Super Admin side */

export const emailSystemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context as Caller);
    const { safeConfigSummary } = await import("@/lib/email.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const counts: Record<string, number> = {};
    for (const status of ["pending", "sent", "failed", "skipped", "expanded"]) {
      const { count } = await (supabaseAdmin as any)
        .from("email_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      counts[status] = count ?? 0;
    }
    return { config: safeConfigSummary(), counts };
  });

export const listEmailLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["all", "pending", "sent", "failed", "skipped", "expanded"]).default("all"),
        kind: z.string().max(40).optional(),
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context as Caller);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin as any)
      .from("email_outbox")
      .select(
        "id, kind, category, recipient_email, subject, status, attempts, last_error, test_mode, delivered_to, sent_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.kind) query = query.eq("kind", data.kind);
    if (data.search) query = query.ilike("recipient_email", `%${data.search}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error("The email log could not be read.");
    return rows ?? [];
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context as Caller);
    const { emailConfig, deliver } = await import("@/lib/email.server");
    const { renderTemplate } = await import("@/lib/email-templates.server");
    const cfg = emailConfig();
    if (!cfg.configured) throw new Error("The email provider is not configured yet.");
    if (!cfg.testRecipient) throw new Error("No test recipient is configured.");
    const rendered = renderTemplate("test", {});
    const res = await deliver({
      intendedTo: cfg.testRecipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (!res.ok) throw new Error(res.error);
    return { ok: true };
  });

export const queueAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        subject: z.string().trim().min(3).max(160),
        heading: z.string().trim().min(3).max(160),
        body: z.string().trim().min(10).max(5000),
        cta_label: z.string().trim().max(60).optional().nullable(),
        cta_url: z.string().trim().url().max(300).optional().nullable(),
        audience: z.enum(["investors", "applicants", "outstanding_balance"]),
        category: z.enum(["marketing", "transactional"]).default("marketing"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as Caller;
    await requireSuperAdmin(context as Caller);
    const { enqueue, emailConfig } = await import("@/lib/email.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    // Staff are never mailed as an audience: partner / adviser / super admin
    // activity must not be exposed through investor mailing lists.
    const { data: staff } = await db
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin", "adviser", "partner"]);
    const staffIds = new Set(((staff ?? []) as any[]).map((s) => s.user_id));

    let targets: { id: string | null; email: string; full_name: string }[] = [];
    if (data.audience === "investors") {
      const { data: rows } = await db.from("profiles").select("id, email, full_name");
      targets = ((rows ?? []) as any[])
        .filter((p) => p.email && !staffIds.has(p.id))
        .map((p) => ({ id: p.id, email: String(p.email).toLowerCase(), full_name: p.full_name ?? "" }));
    } else {
      const statuses =
        data.audience === "applicants"
          ? ["submitted", "under_review", "payment_verification", "approved"]
          : ["submitted", "under_review", "payment_verification", "approved"];
      const { data: apps } = await db
        .from("applications")
        .select("id, investor_id, contact, personal")
        .in("status", statuses);
      const seen = new Set<string>();
      for (const app of (apps ?? []) as any[]) {
        const email = String(app.contact?.email ?? "").trim().toLowerCase();
        if (!email || seen.has(email) || staffIds.has(app.investor_id)) continue;
        seen.add(email);
        targets.push({
          id: app.investor_id ?? null,
          email,
          full_name: app.personal?.full_name ?? "",
        });
      }
    }

    const { data: campaign, error: campaignError } = await db
      .from("email_campaigns")
      .insert({
        subject: data.subject,
        heading: data.heading,
        body: data.body,
        cta_label: data.cta_label || null,
        cta_url: data.cta_url || null,
        audience: data.audience,
        category: data.category,
        test_mode: emailConfig().testMode,
        queued_count: targets.length,
        created_by: userId,
      })
      .select("id")
      .single();
    if (campaignError || !campaign) throw new Error("The announcement could not be recorded.");

    const queued = await enqueue(
      targets.map((t) => ({
        kind: "announcement",
        category: data.category,
        recipient_email: t.email,
        recipient_user_id: t.id,
        subject: data.subject,
        payload: {
          subject: data.subject,
          heading: data.heading,
          body: data.body,
          cta_label: data.cta_label ?? null,
          cta_url: data.cta_url ?? null,
          category: data.category,
          full_name: t.full_name,
        },
        dedupe_key: `campaign:${campaign.id}:${t.email}`,
      })),
    );
    return { queued, recipients: targets.length, testMode: emailConfig().testMode };
  });

export const runEmailQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context as Caller);
    const { processQueue } = await import("@/lib/email.server");
    return processQueue(40);
  });

export const runPaymentReminderScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context as Caller);
    const { scanPaymentReminders } = await import("@/lib/email.server");
    return scanPaymentReminders();
  });

export const retryFailedEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context as Caller);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("email_outbox")
      .update({ status: "pending", attempts: 0, scheduled_for: new Date().toISOString() })
      .eq("status", "failed")
      .select("id");
    if (error) throw new Error("Failed messages could not be re-queued.");
    return { requeued: (data ?? []).length };
  });

/** Public one-click unsubscribe used by the /unsubscribe page. */
export const unsubscribeFromMarketing = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { unsubscribeByToken } = await import("@/lib/email.server");
    try {
      return await unsubscribeByToken(data.token);
    } catch (err) {
      console.error("[email] unsubscribe failed", err);
      return { ok: false };
    }
  });
