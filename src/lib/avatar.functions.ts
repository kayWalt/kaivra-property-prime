import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const AVATARS_BUCKET = "avatars";

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

export const createAvatarUploadTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ fileName: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    const path = `${context.userId}/${crypto.randomUUID()}-${safeName(data.fileName)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket, error } = await supabaseAdmin.storage
      .from(AVATARS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !ticket) throw new Error("Upload could not be prepared. Please try again.");
    return { path, token: ticket.token, bucket: AVATARS_BUCKET, url: `/api/public/avatar/${path}` };
  });

export const removeAvatarFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ path: z.string().min(1).max(300) }).parse(data))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`))
      throw new Error("You can only remove your own picture.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(AVATARS_BUCKET).remove([data.path]);
    return { ok: true };
  });
