import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Investor identity helpers.
 *
 * These extend the existing profiles/applications architecture — there is no
 * second investor, payment or notification system here. Every investor is a
 * row in `public.profiles` carrying a permanent `investor_code`
 * (KVR-INV-000001), assigned by a database trigger and immutable afterwards.
 */

export interface InvestorSummary {
  id: string;
  investor_code: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

const PROFILE_COLUMNS = "id, investor_code, full_name, email, phone, created_at";

async function assertRole(
  supabase: { from: (t: string) => any },
  userId: string,
  allowAdviser = false,
) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("Your permissions could not be verified.");
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");
  const ok = isAdmin || (allowAdviser && roles.includes("adviser"));
  if (!ok) throw new Error("You do not have permission to perform this action.");
  return { isAdmin };
}

/** Searches existing investors by KAIVRA Investor ID, name, email or phone. */
export const searchInvestors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ term: z.string().trim().max(120) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, true);
    const term = data.term.replace(/[%,()]/g, " ").trim();

    let query = context.supabase.from("profiles").select(PROFILE_COLUMNS);
    if (term) {
      const like = `%${term}%`;
      query = query.or(
        `investor_code.ilike.${like},full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
      );
    }
    const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error("Investors could not be searched.");
    return { investors: (rows ?? []) as InvestorSummary[] };
  });

/**
 * Finds an existing investor by application or payment reference so an admin
 * can confirm which record they are about to link.
 */
export const findInvestorByReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ reference: z.string().trim().max(60) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, true);
    const ref = data.reference.replace(/[%,()]/g, " ").trim();
    if (!ref) return { investors: [] as InvestorSummary[] };

    const { data: apps } = await context.supabase
      .from("applications")
      .select("investor_id")
      .ilike("reference", `%${ref}%`)
      .limit(20);
    const { data: pays } = await context.supabase
      .from("application_payments")
      .select("applications(investor_id)")
      .ilike("reference", `%${ref}%`)
      .limit(20);

    const ids = new Set<string>();
    (apps ?? []).forEach((a: { investor_id: string }) => ids.add(a.investor_id));
    (pays ?? []).forEach((p: { applications?: { investor_id?: string } | null }) => {
      if (p.applications?.investor_id) ids.add(p.applications.investor_id);
    });
    if (ids.size === 0) return { investors: [] as InvestorSummary[] };

    const { data: rows } = await context.supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .in("id", [...ids]);
    return { investors: (rows ?? []) as InvestorSummary[] };
  });

/**
 * Registers a brand-new investor identity. Never duplicates: an existing
 * account with the same email is returned instead of a second profile.
 * Passwords are never set, read or stored here — the investor claims the
 * account through the existing password-reset/invitation flow.
 */
export const registerInvestor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(40).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId);
    const email = data.email.toLowerCase();

    const { data: existing } = await context.supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .ilike("email", email)
      .maybeSingle();
    if (existing) return { investor: existing as InvestorSummary, created: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) {
      throw new Error(
        /already/i.test(error?.message ?? "")
          ? "An account already exists with this email address. Search for the investor instead."
          : "The investor account could not be created. Please try again.",
      );
    }

    await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName, email, phone: data.phone || null })
      .eq("id", created.user.id);

    const { data: profile } = await context.supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", created.user.id)
      .maybeSingle();

    return { investor: profile as InvestorSummary, created: true };
  });

/**
 * Starts an application on an investor's behalf, owned by the investor and
 * created by the staff member. It appears in the investor's own dashboard
 * immediately because ownership — not authorship — drives every investor view.
 */
export const createAssistedApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        investorId: z.string().uuid(),
        /** "continue" (default) reuses an open draft; "new" forces a fresh investment. */
        mode: z.enum(["continue", "new"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, true);

    const { data: profile } = await context.supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", data.investorId)
      .maybeSingle();
    if (!profile) throw new Error("That investor could not be found.");
    const investor = profile as InvestorSummary;

    // Duplicate protection: never open a second draft for the same investor.
    if (data.mode !== "new") {
      const { data: draft } = await context.supabase
        .from("applications")
        .select("id")
        .eq("investor_id", data.investorId)
        .in("status", ["draft", "requires_correction"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (draft?.id) return { applicationId: draft.id as string, resumed: true };
    }

    const { data: actor } = await context.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const actorName = actor?.full_name ?? actor?.email ?? "KAIVRA staff";

    const { data: application, error } = await context.supabase
      .from("applications")
      .insert({
        investor_id: data.investorId,
        created_by: context.userId,
        application_method: "assisted",
        adviser_id: context.userId,
        personal: { full_name: investor.full_name ?? "" },
        contact: { email: investor.email ?? "", phone: investor.phone ?? "" },
        investment: { units: 1, payment_plan: "Outright" },
        current_step: 1,
      })
      .select("id")
      .single();
    if (error || !application) {
      console.error("[createAssistedApplication]", error);
      throw new Error("The investment could not be started. Please try again.");
    }

    await context.supabase.from("application_events").insert({
      application_id: application.id,
      actor: context.userId,
      actor_name: actorName,
      action: "assisted_application_created",
      detail: `Investment created on behalf of ${investor.full_name ?? "investor"} (${investor.investor_code ?? "—"})`,
    });

    return { applicationId: application.id as string };
  });

/**
 * Re-owns an existing application so it belongs to the correct investor
 * identity. Administrators only; every link is written to the existing
 * application audit trail and the investor is notified.
 */
export const linkApplicationToInvestor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ applicationId: z.string().uuid(), investorId: z.string().uuid() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId);

    const { data: application } = await context.supabase
      .from("applications")
      .select("id, reference, investor_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!application) throw new Error("This application no longer exists.");
    if (application.investor_id === data.investorId) {
      return { ok: true, unchanged: true };
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", data.investorId)
      .maybeSingle();
    if (!profile) throw new Error("That investor could not be found.");
    const investor = profile as InvestorSummary;

    const { data: actor } = await context.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const actorName = actor?.full_name ?? actor?.email ?? "KAIVRA administrator";

    const { error } = await context.supabase
      .from("applications")
      .update({ investor_id: data.investorId })
      .eq("id", data.applicationId);
    if (error) {
      console.error("[linkApplicationToInvestor]", error);
      throw new Error("The investment could not be linked. Please try again.");
    }

    await context.supabase.from("application_events").insert({
      application_id: data.applicationId,
      actor: context.userId,
      actor_name: actorName,
      action: "investment_linked",
      detail: `Historical investment linked to ${investor.full_name ?? "investor"} (${investor.investor_code ?? "—"})`,
    });

    await context.supabase.from("notifications").insert({
      user_id: data.investorId,
      title: "Investment linked to your account",
      body: `Application ${application.reference ?? ""} is now part of your KAIVRA investment history.`.trim(),
      link: `/applications/${data.applicationId}`,
    });

    return { ok: true, unchanged: false };
  });

export interface AssistApplicationSummary {
  id: string;
  reference: string | null;
  status: string;
  created_at: string;
  submitted_at: string | null;
  project_name: string | null;
  property_name: string | null;
  total_value: number;
  paid: number;
}

/**
 * Staff "Find / Assist Investor" lookup. Resolves ONE existing investor
 * identity (Investor ID, email, phone or name) together with the applications
 * and payment totals the signed-in staff member is already authorised to see.
 * RLS does the authorisation — the Investor ID is only an identifier and never
 * grants access on its own.
 */
export const lookupInvestorForAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ term: z.string().trim().min(2).max(120) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, true);
    const term = data.term.replace(/[%,()]/g, " ").trim();
    const like = `%${term}%`;

    const { data: rows, error } = await context.supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .or(
        `investor_code.ilike.${like},email.ilike.${like},phone.ilike.${like},full_name.ilike.${like}`,
      )
      .limit(10);
    if (error) throw new Error("Unable to retrieve the investor right now. Please try again.");

    const matches = (rows ?? []) as InvestorSummary[];
    if (matches.length === 0) {
      throw new Error("No investor was found with this ID. Please check it and try again.");
    }
    const exact = matches.find(
      (m) => (m.investor_code ?? "").toLowerCase() === term.toLowerCase(),
    );
    const investor = exact ?? matches[0]!;

    const { data: apps } = await context.supabase
      .from("applications")
      .select(
        "id, reference, status, created_at, submitted_at, investment, projects(name), properties(name), application_payments(amount, status)",
      )
      .eq("investor_id", investor.id)
      .order("created_at", { ascending: false });

    const applications: AssistApplicationSummary[] = (
      (apps ?? []) as unknown as {
        id: string;
        reference: string | null;
        status: string;
        created_at: string;
        submitted_at: string | null;
        investment: { total_value?: number } | null;
        projects: { name: string } | null;
        properties: { name: string } | null;
        application_payments: { amount: number | string; status: string }[] | null;
      }[]
    ).map((a) => ({
      id: a.id,
      reference: a.reference,
      status: a.status,
      created_at: a.created_at,
      submitted_at: a.submitted_at,
      project_name: a.projects?.name ?? null,
      property_name: a.properties?.name ?? null,
      total_value: Number(a.investment?.total_value ?? 0),
      paid: (a.application_payments ?? [])
        .filter((p) => p.status === "verified")
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    }));

    const draft = applications.find((a) => a.status === "draft" || a.status === "requires_correction");
    const totalValue = applications.reduce((s, a) => s + a.total_value, 0);
    const paid = applications.reduce((s, a) => s + a.paid, 0);

    return {
      investor,
      applications,
      draftApplicationId: draft?.id ?? null,
      totals: { value: totalValue, paid, outstanding: Math.max(0, totalValue - paid) },
      alternatives: matches.length > 1 ? matches.length : 0,
    };
  });
