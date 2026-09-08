import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { UploadCategory } from "./upload-rules";

/**
 * Confirms that a just-uploaded object really is the file type its category
 * allows. Callers run this straight after `uploadToSignedUrl` and before the
 * document row is written, so a rejected file is removed and never recorded.
 */
export const verifyUploadedFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        bucket: z.enum(["avatars", "project-images", "kaivra-docs"]),
        path: z.string().min(1).max(400),
        category: z.enum([
          "avatar",
          "project_image",
          "passport",
          "signature",
          "proof_of_payment",
          "application_document",
          "correction_document",
        ]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    if (data.path.includes("..")) throw new Error("That file could not be checked.");
    const { verifyStoredObject } = await import("./upload-verify.server");
    const result = await verifyStoredObject(
      data.bucket,
      data.path,
      data.category as UploadCategory,
    );
    if (!result.ok) throw new Error(result.reason);
    return { ok: true as const, contentType: result.contentType };
  });
