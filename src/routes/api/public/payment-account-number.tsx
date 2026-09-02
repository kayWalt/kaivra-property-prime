import { createFileRoute } from "@tanstack/react-router";

/**
 * Authenticated relay for administrator account-number reveals.
 *
 * The custom-domain deployment carries no service-role secret, so it relays
 * here with the caller's Supabase bearer token. This endpoint re-verifies the
 * token and re-checks the administrator role through the caller's own RLS
 * context, so no authorisation is skipped and no secret leaves the server.
 */
export const Route = createFileRoute("/api/public/payment-account-number")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token || token.split(".").length !== 3) {
          return new Response("Unauthorized", { status: 401 });
        }

        let accountId = "";
        try {
          const body = (await request.json()) as { accountId?: unknown };
          const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (typeof body.accountId === "string" && uuid.test(body.accountId)) {
            accountId = body.accountId;
          }
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (!accountId) return new Response("Bad request", { status: 400 });

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
        const userId = data?.claims?.sub;
        if (error || !userId) return new Response("Unauthorized", { status: 401 });

        const { resolvePaymentAccountNumber } = await import("@/lib/payment-accounts.server");
        const result = await resolvePaymentAccountNumber(supabase as never, userId, accountId);
        if (result === "forbidden") return new Response("Forbidden", { status: 403 });
        if (result === null) return new Response("Unavailable", { status: 503 });
        return Response.json({ accountNumber: result });
      },
    },
  },
});
