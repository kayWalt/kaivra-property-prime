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

const PREF_COLUMNS = [
  "marketing_opt_in",
  "promotions_opt_in",
  "new_property_opt_in",
  "campaigns_opt_in",
] as const;

export type EmailPrefs = Record<(typeof PREF_COLUMNS)[number], boolean>;

export const getMyEmailPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Caller;
    const { data } = await supabase
      .from("email_preferences")
      .select(PREF_COLUMNS.join(", "))
      .eq("user_id", userId)
      .maybeSingle();
    const out = {} as EmailPrefs;
    for (const key of PREF_COLUMNS) out[key] = data ? Boolean((data as any)[key]) : true;
    return out;
  });

export const setMyEmailPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        marketing_opt_in: z.boolean().optional(),
        promotions_opt_in: z.boolean().optional(),
        new_property_opt_in: z.boolean().optional(),
        campaigns_opt_in: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Caller;
    const { data: row, error } = await supabase
      .from("email_preferences")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" })
      .select(PREF_COLUMNS.join(", "))
      .maybeSingle();
    if (error) throw new Error("Your email preference could not be saved.");
    const out = {} as EmailPrefs;
    for (const key of PREF_COLUMNS) out[key] = row ? Boolean((row as any)[key]) : true;
    return out;
  });

/* ------------------------------------------------ Installment schedules */

/**
 * Staff-managed payment schedule for one application. RLS on
 * `application_installments` decides who may read or write — the caller's own
 * client is used deliberately so no role can be widened here.
 */
export const listInstallments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Caller;
    const { data: rows, error } = await supabase
      .from("application_installments")
      .select("*")
      .eq("application_id", data.applicationId)
      .order("sequence", { ascending: true });
    if (error) throw new Error("The payment schedule could not be read.");
    return rows ?? [];
  });

export const saveInstallment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        application_id: z.string().uuid(),
        sequence: z.number().int().min(1).max(120),
        label: z.string().trim().min(1).max(80),
        amount_due: z.number().positive(),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        status: z.enum(["scheduled", "paid", "cancelled"]).default("scheduled"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Caller;
    const { error } = await supabase
      .from("application_installments")
      .upsert(data, { onConflict: "application_id,sequence" });
    if (error) throw new Error("The payment schedule could not be saved.");
    return { ok: true };
  });

export const deleteInstallment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Caller;
    const { error } = await supabase.from("application_installments").delete().eq("id", data.id);
    if (error) throw new Error("The scheduled payment could not be removed.");
    return { ok: true };
  });

/* ------------------------------------------------------------ Promotions */

export const listPromotions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context as Caller);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("promotions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Promotions could not be read.");
    return data ?? [];
  });

const promotionInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(160),
  subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5000),
  image_url: z.string().trim().url().max(500).optional().nullable(),
  cta_label: z.string().trim().max(60).optional().nullable(),
  cta_url: z.string().trim().url().max(300).optional().nullable(),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
  audience: z.enum(["opted_in_investors", "property_related", "outstanding_balance"]),
  status: z.enum(["draft", "scheduled", "active", "cancelled", "expired"]).default("draft"),
});

export const savePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => promotionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Caller;
    await requireSuperAdmin(context as Caller);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: Record<string, unknown> = {
      ...data,
      image_url: data.image_url || null,
      cta_label: data.cta_label || null,
      cta_url: data.cta_url || null,
      starts_at: data.starts_at || null,
      ends_at: data.ends_at || null,
      project_id: data.project_id || null,
      property_id: data.property_id || null,
      created_by: userId,
    };
    const { error } = await (supabaseAdmin as any)
      .from("promotions")
      .upsert(payload, { onConflict: "id" });
    if (error) throw new Error("The promotion could not be saved.");
    return { ok: true };
  });

export const setPromotionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "scheduled", "active", "cancelled", "expired"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context as Caller);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("promotions")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error("The promotion could not be updated.");
    return { ok: true };
  });

export const runPromotionCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context as Caller);
    const { processPromotions } = await import("@/lib/email.server");
    return processPromotions();
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
      const statuses = ["submitted", "under_review", "payment_verification", "approved"];
      const { data: apps } = await db
        .from("applications")
        .select("id, investor_id, contact, personal, investment")
        .in("status", statuses);
      let rows = (apps ?? []) as any[];

      if (data.audience === "outstanding_balance") {
        // Only applications whose verified payments do not yet cover the
        // agreed total value are considered to carry an outstanding balance.
        const ids = rows.map((a) => a.id);
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
        rows = rows.filter((a) => {
          const total = Number(a.investment?.total_value ?? 0);
          return total > 0 && (paid.get(a.id) ?? 0) < total;
        });
      }

      const seen = new Set<string>();
      for (const app of rows) {
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
