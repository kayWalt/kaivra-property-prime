/**
 * Server-only relay for the Super Admin email status panel.
 *
 * The production frontend runs on Cloudflare, where the email and service-role
 * secrets deliberately do not exist. This asks the Lovable Cloud backend (which
 * holds them) for the same non-secret configuration summary, forwarding the
 * caller's own Supabase bearer token so authorisation is re-checked there.
 * Returns null when the relay is unavailable, so the caller can fall back.
 */
import { getRequest } from "@tanstack/react-start/server";
import { LOVABLE_ORIGIN } from "@/lib/origin-fallback";

export type EmailStatusPayload = {
  config: {
    configured: boolean;
    testMode: boolean;
    testRecipient: string | null;
    from: string;
    replyTo: string | null;
  };
  counts: Record<string, number>;
};

export async function relayEmailStatus(): Promise<EmailStatusPayload | null> {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader) return null;

  const origin = process.env["LOVABLE_BACKEND_URL"]?.trim() || LOVABLE_ORIGIN;
  try {
    const res = await fetch(`${origin}/api/public/email-admin-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: "{}",
    });
    if (!res.ok) {
      console.error("[email-status-relay] backend responded", res.status);
      return null;
    }
    const body = (await res.json()) as EmailStatusPayload;
    if (!body?.config) return null;
    return body;
  } catch (err) {
    console.error("[email-status-relay] request failed", err);
    return null;
  }
}
