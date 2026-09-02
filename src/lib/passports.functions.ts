import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LOVABLE_ORIGIN, isLovableOrigin } from "./origin-fallback";

export const PASSPORT_URL_TTL_SECONDS = 3600;

/**
 * Returns a signed passport-photo URL for each requested investor.
 *
 * Authorisation is enforced by RLS through the caller's Supabase client.
 * Deployments without a service-role secret (custom domain on Cloudflare)
 * cannot sign private storage objects, so they relay to the Lovable-hosted
 * origin of the same application, forwarding the caller's bearer token — the
 * relay re-verifies it and applies the same RLS.
 */
export const getPassportAvatars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ investorIds: z.array(z.string().uuid()).min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { resolvePassportAvatars } = await import("./passports.server");
    const avatars = await resolvePassportAvatars(context.supabase as never, data.investorIds);
    if (avatars) return { avatars };

    // Signing unavailable locally — relay with the caller's own credentials.
    try {
      const request = getRequest();
      if (request && !isLovableOrigin(request)) {
        const auth = request.headers.get("authorization");
        if (auth) {
          const res = await fetch(`${LOVABLE_ORIGIN}/api/public/passport-avatars`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({ investorIds: data.investorIds }),
          });
          if (res.ok) {
            const json = (await res.json()) as { avatars?: Record<string, string> };
            return { avatars: json.avatars ?? {} };
          }
        }
      }
    } catch (err) {
      console.error("[passports] relay failed", err);
    }

    return { avatars: {} as Record<string, string> };
  });
