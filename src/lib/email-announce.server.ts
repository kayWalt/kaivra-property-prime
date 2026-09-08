/**
 * Server-only core of the Super Admin announcement queue.
 *
 * Shared by the `queueAnnouncement` server function (when it runs where the
 * service-role key exists) and by the protected Lovable Cloud email-admin
 * endpoint the Cloudflare frontend relays to. Behaviour — staff exclusion,
 * audience selection, duplicate suppression, campaign record, enqueue and
 * dedupe key — is identical in both paths.
 */

export type AnnouncementInput = {
  subject: string;
  heading: string;
  body: string;
  cta_label?: string | null | undefined;
  cta_url?: string | null | undefined;
  audience: "investors" | "registered_users" | "applicants" | "outstanding_balance";
  category: "marketing" | "transactional";
};

export type AnnouncementResult = { queued: number; recipients: number; testMode: boolean };

/** Authorisation MUST already have been enforced by the caller. */
export async function queueAnnouncementCore(
  data: AnnouncementInput,
  userId: string,
): Promise<AnnouncementResult> {
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
  if (data.audience === "investors" || data.audience === "registered_users") {
    // "registered_users" = every legitimate registered account (invested,
    // applied-only, or never applied), staff excluded, one email per person.
    const { data: rows } = await db.from("profiles").select("id, email, full_name");
    const seenEmails = new Set<string>();
    targets = ((rows ?? []) as any[])
      .filter((p) => p.email && !staffIds.has(p.id))
      .map((p) => ({
        id: p.id,
        email: String(p.email).trim().toLowerCase(),
        full_name: p.full_name ?? "",
      }))
      .filter((t) => {
        if (!t.email || seenEmails.has(t.email)) return false;
        seenEmails.add(t.email);
        return true;
      });
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
        for (const p of (pays ?? []) as any[]) {
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
      const email = String(app.contact?.email ?? "")
        .trim()
        .toLowerCase();
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
}
