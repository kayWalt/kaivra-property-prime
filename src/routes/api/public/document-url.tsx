import { createFileRoute } from "@tanstack/react-router";

/**
 * Authenticated relay for private application documents.
 *
 * The custom-domain deployment (Cloudflare) carries no service-role secret, so
 * it cannot sign private storage objects. It relays here, to the Lovable-hosted
 * origin of the same application, forwarding the caller's Supabase bearer
 * token. This endpoint re-verifies that token and runs the lookup through the
 * caller's own RLS context, so no authorisation is skipped and no secret ever
 * leaves the server.
 */
export const Route = createFileRoute("/api/public/document-url")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token || token.split(".").length !== 3) {
          return new Response("Unauthorized", { status: 401 });
        }

        let documentId = "";
        try {
          const body = (await request.json()) as { documentId?: unknown };
          const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (typeof body.documentId === "string" && uuid.test(body.documentId)) {
            documentId = body.documentId;
          }
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (!documentId) return new Response("Bad request", { status: 400 });

        const url = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
        const key =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ||
          import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) return new Response("Unavailable", { status: 503 });

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data, error } = await supabase.auth.getClaims(token);
        if (error || !data?.claims?.sub) return new Response("Unauthorized", { status: 401 });

        try {
          const { resolveDocumentUrl } = await import("@/lib/storage.server");
          const doc = await resolveDocumentUrl(supabase as never, documentId);
          if (!doc) return new Response("Unavailable", { status: 503 });
          return Response.json(doc);
        } catch (err) {
          console.error("[document-url] resolution failed", err);
          return new Response("Service temporarily unavailable. Please try again later.", {
            status: 503,
          });
        }
      },
    },
  },
});
