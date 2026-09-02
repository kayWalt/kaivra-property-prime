/**
 * Canonical Lovable-hosted origin for this project.
 *
 * The custom domain (kaivraa.com) is served by a self-hosted Cloudflare
 * Worker that does not carry the Lovable-managed server secrets
 * (SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY). Endpoints that need those
 * secrets fall back to this origin, which is the same application backed by
 * the same database, so behaviour and access control are identical.
 */
export const LOVABLE_ORIGIN = "https://kaivraa-com.lovable.app";

/** True when the running deployment IS the Lovable-hosted origin. */
export function isLovableOrigin(request: Request): boolean {
  try {
    return new URL(request.url).origin === LOVABLE_ORIGIN;
  } catch {
    return false;
  }
}
