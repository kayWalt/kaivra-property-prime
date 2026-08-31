import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOCS_BUCKET } from "./storage.server";

/**
 * Permanently deletes an application. Administrators only — the caller's role
 * is read server-side from `user_roles` through their own RLS-scoped client,
 * never trusted from the request body.
 *
 * Payments, documents and events cascade with the application row; the stored
 * files are removed separately so nothing is orphaned in private storage.
 */
export const deleteApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ applicationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error("Your permissions could not be verified.");
    const isAdmin = (roles ?? []).some((r) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Only KAIVRA administrators can delete an application.");

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

    const { error: deleteError } = await supabaseAdmin
      .from("applications")
      .delete()
      .eq("id", data.applicationId);
    if (deleteError) throw new Error("The application could not be deleted. Please try again.");

    await supabaseAdmin.from("admin_audit_events").insert({
      actor: context.userId,
      action: "application_deleted",
      subject_user: application.investor_id,
      detail: { application_id: application.id, reference: application.reference },
    });

    return { ok: true, reference: application.reference };
  });
