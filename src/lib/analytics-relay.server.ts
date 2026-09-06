/**
 * Server-only relay for the Super Admin analytics page.
 *
 * The production frontend runs on Cloudflare, where SUPABASE_SERVICE_ROLE_KEY
 * deliberately does not exist, so the privileged analytics reads cannot run
 * there. This forwards the caller's own Supabase bearer token to the Lovable
 * Cloud backend (which holds the key), where authorisation is re-checked.
 * Returns null when the relay is unavailable so the caller can surface a clear
 * "could not load" state instead of false zeroes.
 */
import { getRequest } from "@tanstack/react-start/server";
import { LOVABLE_ORIGIN } from "@/lib/origin-fallback";
import type { AnalyticsOp } from "@/lib/analytics-schemas";

export async function relayAnalytics<T>(op: AnalyticsOp, data: unknown): Promise<T | null> {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader) return null;

  const origin = process.env["LOVABLE_BACKEND_URL"]?.trim() || LOVABLE_ORIGIN;
  try {
    const res = await fetch(`${origin}/api/public/analytics-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ op, data }),
    });
    if (!res.ok) {
      console.error("[analytics-relay] backend responded", res.status);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error("[analytics-relay] request failed", err);
    return null;
  }
}
