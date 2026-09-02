import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DOCS_BUCKET } from "./storage.server";

export const PASSPORT_URL_TTL_SECONDS = 3600;

/**
 * Resolves signed passport-photo URLs for the given investors.
 *
 * Authorisation is enforced by RLS: the query runs through the *caller's*
 * Supabase client, so `application_documents` only yields rows the caller may
 * view. The service-role client is used only to sign paths RLS already
 * authorised. Returns `null` when signing is unavailable on this deployment
 * (no service-role secret), so callers can relay instead of failing.
 */
export async function resolvePassportAvatars(
  supabase: SupabaseClient<Database>,
  investorIds: string[],
): Promise<Record<string, string> | null> {
  const { data: docs, error } = await supabase
    .from("application_documents")
    .select("file_path, created_at, applications!inner(investor_id)")
    .eq("kind", "passport")
    .in("applications.investor_id", investorIds)
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
  if (latest.size === 0) return {};

  const paths = [...latest.values()];
  let signed: { path?: string | null; signedUrl?: string | null; error?: string | null }[] | null =
    null;

  // Preferred: sign with the caller's own client. Storage RLS on the documents
  // bucket already authorises owners and staff, so no server secret is needed
  // and every deployment (Lovable, GitHub, Cloudflare) behaves identically.
  try {
    const res = await supabase.storage.from(DOCS_BUCKET).createSignedUrls(paths, PASSPORT_URL_TTL_SECONDS);
    if (!res.error && res.data?.some((i) => i.signedUrl)) signed = res.data;
  } catch (err) {
    console.error("[passports] caller signing failed", err);
  }

  // Fallback: service-role signing where the secret is available.
  if (!signed) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const res = await supabaseAdmin.storage
        .from(DOCS_BUCKET)
        .createSignedUrls(paths, PASSPORT_URL_TTL_SECONDS);
      if (!res.error) signed = res.data;
    } catch (err) {
      console.error("[passports] signing unavailable", err);
    }
  }
  if (!signed) return null;


  const byPath = new Map<string, string>();
  for (const item of signed) {
    if (item.path && item.signedUrl && !item.error) byPath.set(item.path, item.signedUrl);
  }

  const avatars: Record<string, string> = {};
  for (const [investorId, path] of latest) {
    const url = byPath.get(path);
    if (url) avatars[investorId] = url;
  }
  return avatars;
}
