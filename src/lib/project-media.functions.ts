import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminCan } from "@/lib/admin-permissions.server";
import { assertUploadAllowed, isSafeStoragePath } from "@/lib/upload-rules";

export const PROJECT_IMAGES_BUCKET = "project-images";

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

export const createProjectImageUploadTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        scope: z.enum(["project", "property"]).default("project"),
        fileName: z.string().min(1).max(200),
        contentType: z.string().max(120).optional(),
        size: z.number().int().nonnegative().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminCan(context.supabase as never, context.userId, "projects", "manage");
    assertUploadAllowed("project_image", {
      fileName: data.fileName,
      contentType: data.contentType ?? null,
      size: data.size ?? null,
    });

    const path = `${data.scope}/${crypto.randomUUID()}-${safeName(data.fileName)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket, error } = await supabaseAdmin.storage
      .from(PROJECT_IMAGES_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !ticket) throw new Error("Upload could not be prepared. Please try again.");
    return {
      path,
      token: ticket.token,
      bucket: PROJECT_IMAGES_BUCKET,
      url: `/api/public/project-image/${path}`,
    };
  });

/**
 * Confirms a just-uploaded project image really is an image before its URL can
 * be attached to a project. Admin-only, same permission as the ticket.
 */
export const finalizeProjectImageUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        scope: z.enum(["project", "property"]),
        path: z.string().min(1).max(300),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminCan(context.supabase as never, context.userId, "projects", "manage");
    if (!isSafeStoragePath(data.path, `${data.scope}/`))
      throw new Error("You do not have permission to do that.");

    const { verifyOrThrow } = await import("./upload-verify.server");
    await verifyOrThrow(PROJECT_IMAGES_BUCKET, data.path, "project_image");
    return { url: `/api/public/project-image/${data.path}` };
  });

