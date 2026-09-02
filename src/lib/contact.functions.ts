import { createServerFn } from "@tanstack/react-start";
import { LOVABLE_ORIGIN } from "@/lib/origin-fallback";
import {
  contactEnquirySchema,
  type ContactEnquiryInput,
  type ContactEnquiryResult,
} from "@/lib/contact.server";

/**
 * Public contact-enquiry intake.
 *
 * Validation, spam checks and persistence all happen server-side so the
 * browser can never bypass them. Storage uses the service-role client, which
 * only the Lovable-hosted deployment carries; the custom-domain Cloudflare
 * Worker relays to that origin instead of failing with a missing-secret error.
 */
async function relay(data: ContactEnquiryInput): Promise<ContactEnquiryResult> {
  const res = await fetch(`${LOVABLE_ORIGIN}/api/public/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = (await res.json().catch(() => null)) as
    | (ContactEnquiryResult & { error?: string })
    | null;
  if (!res.ok || !payload || payload.error) {
    throw new Error(
      payload?.error || "Your enquiry could not be recorded. Please try again.",
    );
  }
  return { reference: payload.reference ?? null, notified: Boolean(payload.notified) };
}

export const submitContactEnquiry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => contactEnquirySchema.parse(data))
  .handler(async ({ data }): Promise<ContactEnquiryResult> => {
    const { hasServiceRoleKey, recordContactEnquiry } = await import("@/lib/contact.server");
    if (!hasServiceRoleKey()) return relay(data);
    try {
      return await recordContactEnquiry(data);
    } catch (err) {
      // A local Supabase/env failure should not lose the visitor's enquiry.
      if (err instanceof Error && /Missing Supabase environment/i.test(err.message)) {
        return relay(data);
      }
      throw err;
    }
  });
