import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUploadAllowed, isSafeStoragePath } from "@/lib/upload-rules";

export const AVATARS_BUCKET = "avatars";

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

export const createAvatarUploadTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        fileName: z.string().min(1).max(200),
        contentType: z.string().max(120).optional(),
        size: z.number().int().nonnegative().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    assertUploadAllowed("avatar", {
      fileName: data.fileName,
      contentType: data.contentType ?? null,
      size: data.size ?? null,
    });
    const path = `${context.userId}/${crypto.randomUUID()}-${safeName(data.fileName)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket, error } = await supabaseAdmin.storage
      .from(AVATARS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !ticket) throw new Error("Upload could not be prepared. Please try again.");
    return { path, token: ticket.token, bucket: AVATARS_BUCKET, url: `/api/public/avatar/${path}` };
  });

/**
 * The only way `profiles.avatar_url` is set. The picture is confirmed to be a
 * real image, and to live in the caller's own folder, before the profile is
 * updated; the browser can no longer write this column itself.
 */
export const finalizeAvatarUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ path: z.string().min(1).max(300) }).parse(data))
  .handler(async ({ data, context }) => {
    if (!isSafeStoragePath(data.path, `${context.userId}/`))
      throw new Error("You do not have permission to do that.");

    const { verifyOrThrow } = await import("./upload-verify.server");
    await verifyOrThrow(AVATARS_BUCKET, data.path, "avatar");

    const url = `/api/public/avatar/${data.path}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", context.userId);
    if (error) throw new Error("Your picture could not be saved.");
    return { url };
  });

export const removeAvatarFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ path: z.string().min(1).max(300) }).parse(data))
  .handler(async ({ data, context }) => {
    if (!isSafeStoragePath(data.path, `${context.userId}/`))
      throw new Error("You can only remove your own picture.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ avatar_url: null }).eq("id", context.userId);
    await supabaseAdmin.storage.from(AVATARS_BUCKET).remove([data.path]);
    return { ok: true };
  });

