/**
 * Server-only relay for the Super Admin email administration page.
 *
 * The production frontend runs on Cloudflare, where the email and service-role
 * secrets deliberately do not exist. This asks the Lovable Cloud backend (which
 * holds them) for the same non-secret admin payloads, forwarding the caller's
 * own Supabase bearer token so authorisation is re-checked there.
 * Returns null when the relay is unavailable, so the caller can fall back.
 */
import { getRequest } from "@tanstack/react-start/server";
import { LOVABLE_ORIGIN, isLovableOrigin } from "@/lib/origin-fallback";

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

export type EmailAdminOp =
  | "status"
  | "emailLog"
  | "promotions"
  | "savePromotion"
  | "setPromotionStatus"
  | "queueAnnouncement"
  | "retryFailedEmails";


/** Forward one admin email read to Lovable Cloud with the caller's own token. */
export async function relayEmailAdmin<T>(op: EmailAdminOp, data?: unknown): Promise<T | null> {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader) return null;

  // Loop guard: never relay from the Lovable origin to itself, and never relay
  // a request that already arrived through the relay.
  if (request && isLovableOrigin(request)) return null;
  if (request?.headers?.get("x-kaivra-email-relay") === "1") return null;

  const origin = process.env["LOVABLE_BACKEND_URL"]?.trim() || LOVABLE_ORIGIN;
  try {
    const res = await fetch(`${origin}/api/public/email-admin-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "x-kaivra-email-relay": "1",
      },
      body: JSON.stringify({ op, data: data ?? {} }),
    });
    if (!res.ok) {
      console.error("[email-admin-relay] backend responded", op, res.status);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error("[email-admin-relay] request failed", op, err);
    return null;
  }
}

export async function relayEmailStatus(): Promise<EmailStatusPayload | null> {
  const body = await relayEmailAdmin<EmailStatusPayload>("status");
  if (!body?.config) return null;
  return body;
}
