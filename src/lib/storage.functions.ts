import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOCS_BUCKET, buildDocPath } from "./storage.server";
import { LOVABLE_ORIGIN, isLovableOrigin } from "./origin-fallback";

export const createUploadTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        applicationId: z.string().uuid(),
        kind: z.string().min(1).max(40),
        fileName: z.string().min(1).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // RLS on `applications` decides visibility: if the caller can select the
    // row, they are allowed to attach documents to it.
    const { data: allowed, error: accessError } = await context.supabase
      .from("applications")
      .select("id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (accessError) throw new Error("Could not verify access to this application.");
    if (!allowed) throw new Error("You do not have permission to upload to this application.");

    const path = buildDocPath(data.applicationId, data.kind, data.fileName);

    // Preferred: sign with the caller's own client. Storage RLS already limits
    // this bucket to the owner and authorised staff, so no server secret is
    // needed and every deployment behaves identically.
    try {
      const { data: mine } = await context.supabase.storage
        .from(DOCS_BUCKET)
        .createSignedUploadUrl(path);
      if (mine?.token) return { path, token: mine.token, bucket: DOCS_BUCKET };
    } catch (err) {
      console.error("[storage] caller upload signing failed", err);
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: ticket, error } = await supabaseAdmin.storage
        .from(DOCS_BUCKET)
        .createSignedUploadUrl(path);
      if (error || !ticket) throw new Error("no ticket");
      return { path, token: ticket.token, bucket: DOCS_BUCKET };
    } catch (err) {
      console.error("[storage] upload signing unavailable", err);
      throw new Error("Upload could not be prepared. Please try again.");
    }
  });


export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ documentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { resolveDocumentUrl } = await import("./storage.server");
    const doc = await resolveDocumentUrl(context.supabase as never, data.documentId);
    if (doc) return doc;

    // Signing unavailable locally (custom domain without service-role secret) —
    // relay to the Lovable-hosted origin with the caller's own credentials.
    try {
      const request = getRequest();
      if (request && !isLovableOrigin(request)) {
        const auth = request.headers.get("authorization");
        if (auth) {
          const res = await fetch(`${LOVABLE_ORIGIN}/api/public/document-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({ documentId: data.documentId }),
          });
          if (res.ok) {
            return (await res.json()) as {
              url: string;
              fileName: string | null;
              mimeType: string | null;
            };
          }
        }
      }
    } catch (err) {
      console.error("[storage] document relay failed", err);
    }

    throw new Error("Document link could not be created.");
  });
