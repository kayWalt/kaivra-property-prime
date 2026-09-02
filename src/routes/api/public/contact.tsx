import { createFileRoute } from "@tanstack/react-router";
import { contactEnquirySchema } from "@/lib/contact.server";

/**
 * Public enquiry intake endpoint.
 *
 * Exists so the custom-domain Cloudflare Worker (which does not carry the
 * service-role secret) can relay enquiries to the Lovable-hosted origin of the
 * same application and the same database. Validation and storage rules are
 * identical to the server function — no duplicate table, no duplicate logic.
 */
export const Route = createFileRoute("/api/public/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = contactEnquirySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid enquiry details." }, { status: 400 });
        }
        try {
          const { recordContactEnquiry } = await import("@/lib/contact.server");
          return Response.json(await recordContactEnquiry(parsed));
        } catch (err) {
          const message =
            err instanceof Error && err.message
              ? err.message
              : "Your enquiry could not be recorded. Please try again.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
