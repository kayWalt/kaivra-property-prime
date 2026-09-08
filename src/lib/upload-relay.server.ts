import { getRequest } from "@tanstack/react-start/server";
import { LOVABLE_ORIGIN, isLovableOrigin } from "./origin-fallback";

/**
 * Upload steps that need a trusted server (signing a private upload URL,
 * reading the stored bytes, writing the verified database row) run with the
 * Lovable Cloud-managed server credentials.
 *
 * The custom-domain deployment (Cloudflare Worker) does not carry those
 * managed credentials, so — exactly like the existing document-url, passport
 * and payment-account relays — it forwards the step to the Lovable-hosted
 * origin of the same application, passing the caller's own Supabase bearer
 * token. The relayed request re-runs the identical authorisation, path and
 * byte checks there; nothing is skipped and no secret ever leaves the server.
 */
export type UploadOp =
  | "avatarTicket"
  | "avatarFinalize"
  | "avatarRemove"
  | "projectImageTicket"
  | "projectImageFinalize"
  | "documentFinalize"
  | "correctionTicket"
  | "correctionFinalize";

/** True when this deployment holds the managed trusted-server credentials. */
export function hasTrustedServer(): boolean {
  return Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

/**
 * Returns the relayed result, or `null` when this deployment should handle the
 * step itself (managed credentials present, or we already are the origin).
 */
export async function relayUploadOp<T>(op: UploadOp, data: unknown): Promise<T | null> {
  if (hasTrustedServer()) return null;

  let request: Request | undefined;
  try {
    request = getRequest();
  } catch {
    request = undefined;
  }
  // No loop: the Lovable-hosted origin never relays to itself.
  if (!request || isLovableOrigin(request)) return null;

  const auth = request.headers.get("authorization");
  if (!auth) return null;

  const res = await fetch(`${LOVABLE_ORIGIN}/api/public/upload-op`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ op, data }),
  });

  if (!res.ok) {
    const reason = (await res.text().catch(() => "")).slice(0, 300).trim();
    throw new Error(reason || "Upload could not be completed. Please try again.");
  }
  return (await res.json()) as T;
}
