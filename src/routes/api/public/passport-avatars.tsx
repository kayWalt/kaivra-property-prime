import { createFileRoute } from "@tanstack/react-router";

/**
 * Authenticated relay for investor passport photographs.
 *
 * The custom-domain deployment (Cloudflare) carries no service-role secret, so
 * it cannot sign private storage objects. It relays here, to the Lovable-hosted
 * origin of the same application, forwarding the caller's Supabase bearer
 * token. This endpoint re-verifies that token and runs the query through the
 * caller's own RLS context, so no authorisation is skipped and no secret ever
 * leaves the server.
 */
export const Route = createFileRoute("/api/public/passport-avatars")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token || token.split(".").length !== 3) {
          return new Response("Unauthorized", { status: 401 });
        }

        let investorIds: string[] = [];
        try {
          const body = (await request.json()) as { investorIds?: unknown };
          const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          investorIds = Array.isArray(body.investorIds)
            ? body.investorIds.filter((v): v is string => typeof v === "string" && uuid.test(v))
            : [];
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (investorIds.length === 0 || investorIds.length > 200) {
          return new Response("Bad request", { status: 400 });
        }

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
          const { resolvePassportAvatars } = await import("@/lib/passports.server");
          const avatars = await resolvePassportAvatars(supabase as never, investorIds);
          return Response.json({ avatars: avatars ?? {} });
        } catch {
          return Response.json({ avatars: {} });
        }
      },
    },
  },
});
