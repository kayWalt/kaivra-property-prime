export const DOCS_BUCKET = "kaivra-docs";

export function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

export function buildDocPath(applicationId: string, kind: string, fileName: string) {
  return `${applicationId}/${kind}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ResolvedDocument = { url: string; fileName: string | null; mimeType: string | null };

/**
 * Resolves a short-lived signed URL for one application document.
 *
 * Authorisation is enforced by RLS through the caller's Supabase client; the
 * service-role client only signs a path RLS already authorised. Returns `null`
 * when signing is unavailable on this deployment (no service-role secret), so
 * callers can relay to the Lovable-hosted origin instead of failing.
 */
export async function resolveDocumentUrl(
  supabase: SupabaseClient<Database>,
  documentId: string,
): Promise<ResolvedDocument | null> {
  const { data: doc, error } = await supabase
    .from("application_documents")
    .select("id, file_path, file_name, mime_type")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error("Document could not be loaded.");
  if (!doc) throw new Error("Document not found or you do not have access to it.");

  // Preferred: sign with the caller's own client. Storage RLS already limits
  // this bucket to the uploader and authorised staff, so no server secret is
  // required and every deployment behaves identically.
  try {
    const { data: mine } = await supabase.storage
      .from(DOCS_BUCKET)
      .createSignedUrl(doc.file_path, 120);
    if (mine?.signedUrl) {
      return { url: mine.signedUrl, fileName: doc.file_name, mimeType: doc.mime_type };
    }
  } catch (err) {
    console.error("[storage] caller signing failed", err);
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(DOCS_BUCKET)
      .createSignedUrl(doc.file_path, 120);
    if (signError || !signed) return null;
    return { url: signed.signedUrl, fileName: doc.file_name, mimeType: doc.mime_type };
  } catch (err) {
    console.error("[storage] signing unavailable", err);
    return null;
  }

}
