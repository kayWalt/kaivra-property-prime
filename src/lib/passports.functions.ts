import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOCS_BUCKET } from "./storage.server";

export const PASSPORT_URL_TTL_SECONDS = 3600;

/**
 * Returns a signed passport-photo URL for each requested investor, in ONE
 * database round-trip and ONE storage sign call.
 *
 * Authorisation is enforced by RLS: the query runs through the caller's
 * Supabase client, so `application_documents` only yields rows for
 * applications the caller may view (own applications for investors, assigned
 * projects for advisers, everything for admins). The service-role client is
 * used only to sign paths that RLS has already authorised.
 */
export const getPassportAvatars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ investorIds: z.array(z.string().uuid()).min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: docs, error } = await context.supabase
      .from("application_documents")
      .select("file_path, created_at, applications!inner(investor_id)")
      .eq("kind", "passport")
      .in("applications.investor_id", data.investorIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Investor photographs could not be loaded.");

    // Keep the most recent passport per investor.
    const latest = new Map<string, string>();
    for (const row of docs ?? []) {
      const investorId = (row as unknown as { applications: { investor_id: string } }).applications
        ?.investor_id;
      if (!investorId || latest.has(investorId)) continue;
      latest.set(investorId, row.file_path);
    }
    if (latest.size === 0) return { avatars: {} as Record<string, string> };

    const paths = [...latest.values()];
    // Signing needs the privileged client. If this deployment has no service
    // role configured, fall back to no photographs (initials placeholder)
    // instead of failing the whole directory request.
    let signed: { path?: string | null; signedUrl?: string | null; error?: string | null }[] | null =
      null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const res = await supabaseAdmin.storage
        .from(DOCS_BUCKET)
        .createSignedUrls(paths, PASSPORT_URL_TTL_SECONDS);
      if (!res.error) signed = res.data;
    } catch (err) {
      console.error("[passports] signing unavailable", err);
    }
    if (!signed) return { avatars: {} as Record<string, string> };

    const byPath = new Map<string, string>();
    for (const item of signed) {
      if (item.path && item.signedUrl && !item.error) byPath.set(item.path, item.signedUrl);
    }

    const avatars: Record<string, string> = {};
    for (const [investorId, path] of latest) {
      const url = byPath.get(path);
      if (url) avatars[investorId] = url;
    }
    return { avatars };
  });
