import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminCan } from "@/lib/admin-permissions.server";

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
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdminCan(context.supabase as never, context.userId, "projects", "manage");

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
