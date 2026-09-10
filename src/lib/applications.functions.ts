import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminCan } from "@/lib/admin-permissions.server";
import { DOCS_BUCKET } from "./storage.server";

/**
 * Permanently deletes an application. Administrators only — the caller's role
 * is read server-side from `user_roles` through their own RLS-scoped client,
 * never trusted from the request body.
 *
 * Payments, documents and events cascade with the application row; the stored
 * files are removed separately so nothing is orphaned in private storage.
 */
/**
 * Read-only lookup: resolve an Investment ID / KAIVRA reference to its
 * application id. Never creates or modifies anything. The caller's own
 * RLS-scoped client is used, so investors can only ever resolve investments
 * they own and staff only the applications they are authorised to review —
 * a foreign id returns the same generic "not found" as a nonexistent one.
 */
const LOOKUP_SAFE = /^[A-Za-z0-9/_-]{2,80}$/;

export const findInvestmentByReference = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ reference: z.string().trim() }).parse(data))
  .handler(async ({ data, context }) => {
    const term = data.reference.trim();
    if (!LOOKUP_SAFE.test(term)) throw new Error("Investment not found.");

    const filters = [`reference.ilike."${term}"`, `legacy_reference.ilike."${term}"`];
    if (z.string().uuid().safeParse(term).success) filters.push(`id.eq.${term}`);

    const { data: rows } = await context.supabase
      .from("applications")
      .select("id, reference")
      .or(filters.join(","))
      .limit(1);
    const found = rows?.[0];
    if (found) return { applicationId: found.id, reference: found.reference ?? null };

    // Investor IDs (KVR-I-…) are also accepted: open that investor's most
    // recent investment, still scoped by the caller's own RLS permissions.
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id")
      .or(`investor_code.ilike."${term}",legacy_investor_code.ilike."${term}"`)
      .limit(1)
      .maybeSingle();

    if (profile) {
      const { data: owned } = await context.supabase
        .from("applications")
        .select("id, reference")
        .eq("investor_id", profile.id)
        .neq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1);
      const latest = owned?.[0];
      if (latest) return { applicationId: latest.id, reference: latest.reference ?? null };
    }

    throw new Error("Investment not found.");
  });


export const deleteApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ applicationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Honours Proxy Admin module permissions and the access window.
    await assertAdminCan(context.supabase as never, context.userId, "applications", "edit");

    const { data: application, error: appError } = await context.supabase
      .from("applications")
      .select("id, reference, investor_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (appError) throw new Error("The application could not be loaded.");
    if (!application) throw new Error("This application no longer exists.");

    const { data: docs } = await context.supabase
      .from("application_documents")
      .select("file_path")
      .eq("application_id", data.applicationId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const paths = (docs ?? []).map((d) => d.file_path).filter(Boolean);
    if (paths.length > 0) {
      await supabaseAdmin.storage.from(DOCS_BUCKET).remove(paths);
    }

    // Inspections keep a nullable link, so detach them before removing the row.
    await supabaseAdmin
      .from("inspection_appointments")
      .update({ application_id: null })
      .eq("application_id", data.applicationId);

    // Delete through the caller's own client: the admin RLS policy allows it and
    // the service-role path can be rejected when the Data API key is unavailable.
    const { error: deleteError } = await context.supabase
      .from("applications")
      .delete()
      .eq("id", data.applicationId);
    if (deleteError) {
      console.error("[deleteApplication] delete failed", deleteError);
      const { error: adminDeleteError } = await supabaseAdmin
        .from("applications")
        .delete()
        .eq("id", data.applicationId);
      if (adminDeleteError) {
        console.error("[deleteApplication] admin delete failed", adminDeleteError);
        throw new Error(`The application could not be deleted: ${adminDeleteError.message}`);
      }
    }

    await supabaseAdmin.from("admin_audit_events").insert({
      actor: context.userId,
      action: "application_deleted",
      subject_user: application.investor_id,
      detail: { application_id: application.id, reference: application.reference },
    });

    return { ok: true, reference: application.reference };
  });
