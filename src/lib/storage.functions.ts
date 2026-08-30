import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOCS_BUCKET, buildDocPath } from "./storage.server";

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
    const { data: allowed, error: rpcError } = await context.supabase.rpc("can_view_application", {
      _app_id: data.applicationId,
    });
    if (rpcError) throw new Error("Could not verify access to this application.");
    if (!allowed) throw new Error("You do not have permission to upload to this application.");

    const path = buildDocPath(data.applicationId, data.kind, data.fileName);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket, error } = await supabaseAdmin.storage
      .from(DOCS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !ticket) throw new Error("Upload could not be prepared. Please try again.");
    return { path, token: ticket.token, bucket: DOCS_BUCKET };
  });

export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ documentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("application_documents")
      .select("id, file_path, file_name, mime_type")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error) throw new Error("Document could not be loaded.");
    if (!doc) throw new Error("Document not found or you do not have access to it.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(DOCS_BUCKET)
      .createSignedUrl(doc.file_path, 120);
    if (signError || !signed) throw new Error("Document link could not be created.");
    return { url: signed.signedUrl, fileName: doc.file_name, mimeType: doc.mime_type };
  });
