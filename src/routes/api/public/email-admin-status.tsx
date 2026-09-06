import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Super Admin email configuration/status, served from the Lovable Cloud
 * backend where the email secrets actually live.
 *
 * The Cloudflare-hosted frontend cannot read RESEND_API_KEY / EMAIL_TEST_MODE /
 * SUPABASE_SERVICE_ROLE_KEY, so its server function relays here with the
 * caller's own Supabase bearer token. The route sits under /api/public only so
 * the relay can reach it; every request must carry a valid user token AND the
 * database `super_admin` role. No secret value is ever returned — only whether
 * things are configured, the sending mode, and the sender address.
 */
export const Route = createFileRoute("/api/public/email-admin-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        if (!token || token.split(".").length !== 3) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
        const publishable =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ||
          import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !publishable) {
          return Response.json({ error: "Email status is unavailable." }, { status: 500 });
        }

        try {
          const scoped = createClient(url, publishable, {
            global: { headers: { Authorization: `Bearer ${token}`, apikey: publishable } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: claims, error: claimsError } = await scoped.auth.getClaims(token);
          const userId = claims?.claims?.sub;
          if (claimsError || !userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const { data: roleRows, error: roleError } = await scoped
            .from("user_roles")
            .select("role")
            .eq("user_id", userId);
          const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
          if (roleError || !roles.includes("super_admin")) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }

          const body = (await request.json().catch(() => ({}))) as {
            op?: string;
            data?: Record<string, unknown>;
          };
          const op = body?.op ?? "status";
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;

          if (op === "emailLog") {
            const input = (body.data ?? {}) as Record<string, unknown>;
            const allowed = ["all", "pending", "sent", "failed", "skipped", "expanded"];
            const statusFilter =
              typeof input["status"] === "string" && allowed.includes(input["status"] as string)
                ? (input["status"] as string)
                : "all";
            const limit = Math.min(Math.max(Number(input["limit"] ?? 100) || 100, 1), 200);
            let query = db
              .from("email_outbox")
              .select(
                "id, kind, category, recipient_email, subject, status, attempts, last_error, test_mode, delivered_to, sent_at, created_at",
              )
              .order("created_at", { ascending: false })
              .limit(limit);
            if (statusFilter !== "all") query = query.eq("status", statusFilter);
            if (typeof input["kind"] === "string" && input["kind"]) {
              query = query.eq("kind", input["kind"]);
            }
            if (typeof input["search"] === "string" && input["search"]) {
              query = query.ilike("recipient_email", `%${String(input["search"]).slice(0, 120)}%`);
            }
            const { data: rows, error } = await query;
            if (error) throw error;
            return Response.json({ rows: rows ?? [] });
          }

          if (op === "promotions") {
            const { data: rows, error } = await db
              .from("promotions")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(100);
            if (error) throw error;
            return Response.json({ rows: rows ?? [] });
          }

          if (op !== "status") {
            return Response.json({ error: "Unknown operation" }, { status: 400 });
          }

          const { safeConfigSummary } = await import("@/lib/email.server");
          const counts: Record<string, number> = {};
          for (const status of ["pending", "sent", "failed", "skipped", "expanded"]) {
            const { count } = await db
              .from("email_outbox")
              .select("id", { count: "exact", head: true })
              .eq("status", status);
            counts[status] = count ?? 0;
          }
          return Response.json({ config: safeConfigSummary(), counts });
        } catch (err) {
          console.error("[email-admin-status] failed", err);
          return Response.json({ error: "Email status is unavailable." }, { status: 500 });
        }
      },
    },
  },
});
