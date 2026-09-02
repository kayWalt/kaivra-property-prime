import { createFileRoute } from "@tanstack/react-router";
import { contactEnquirySchema } from "@/lib/contact.server";

/**
 * Public enquiry intake endpoint.
 *
 * Exists so the custom-domain Cloudflare Worker (which does not carry the
 * service-role secret) can relay enquiries to the Lovable-hosted origin of the
 * same application and the same database. Validation and storage rules are
 * identical to the server function — no duplicate table, no duplicate logic.
 *
 * CORS is enabled so the browser on kaivraa.com can also post here directly as
 * a last-resort fallback. Only this write-only intake is exposed; no data is
 * ever returned beyond the enquiry reference.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const Route = createFileRoute("/api/public/contact")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = contactEnquirySchema.parse(await request.json());
        } catch {
          return Response.json(
            { error: "Invalid enquiry details." },
            { status: 400, headers: corsHeaders },
          );
        }
        try {
          const { recordContactEnquiry } = await import("@/lib/contact.server");
          return Response.json(await recordContactEnquiry(parsed), { headers: corsHeaders });
        } catch (err) {
          const message =
            err instanceof Error && err.message
              ? err.message
              : "Your enquiry could not be recorded. Please try again.";
          return Response.json({ error: message }, { status: 400, headers: corsHeaders });
        }
      },
    },
  },
});
