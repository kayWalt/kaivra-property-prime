import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const AVATARS_BUCKET_NAME = "avatars";
export const AVATAR_URL_TTL_SECONDS = 3600;

/**
 * Signs an avatar object through the CALLER'S Supabase client, so Storage RLS
 * decides access (owners read their own picture, staff read investor
 * pictures). Used as a fallback when the streaming `/api/public/avatar/*`
 * route is unavailable — e.g. a self-hosted deployment without a service-role
 * key configured. Never widens access beyond the existing policies.
 */
export const signAvatarUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ path: z.string().min(1).max(300) }).parse(data))
  .handler(async ({ data, context }) => {
    if (data.path.includes("..")) return { url: null as string | null };
    const { data: signed, error } = await context.supabase.storage
      .from(AVATARS_BUCKET_NAME)
      .createSignedUrl(data.path, AVATAR_URL_TTL_SECONDS);
    if (error || !signed) return { url: null as string | null };
    return { url: signed.signedUrl as string | null };
  });
