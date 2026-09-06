import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  ANALYTICS_OPS,
  directorySchema,
  filterSchema,
  footprintSchema,
  rangeSchema,
  retentionSchema,
  type AnalyticsOp,
} from "@/lib/analytics-schemas";

/**
 * Super Admin analytics reads, served from the Lovable Cloud backend where the
 * privileged Supabase credentials actually live.
 *
 * The Cloudflare-hosted frontend cannot read SUPABASE_SERVICE_ROLE_KEY, so its
 * analytics server functions relay here with the caller's own Supabase bearer
 * token. The route sits under /api/public only so the relay can reach it; every
 * request must carry a valid user token AND the database `super_admin` role.
 * No secret value is ever returned — only the same analytics payloads the page
 * already renders.
 */
export const Route = createFileRoute("/api/public/analytics-admin")({
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
          return Response.json({ error: "Analytics is unavailable." }, { status: 500 });
        }

        try {
          const body = (await request.json()) as { op?: string; data?: unknown };
          const op = body?.op as AnalyticsOp;
          if (!op || !(ANALYTICS_OPS as readonly string[]).includes(op)) {
            return Response.json({ error: "Unknown operation" }, { status: 400 });
          }

          const scoped = createClient(url, publishable, {
            global: { headers: { Authorization: `Bearer ${token}`, apikey: publishable } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: claims, error: claimsError } = await scoped.auth.getClaims(token);
          const userId = claims?.claims?.sub as string | undefined;
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

          const core = await import("@/lib/analytics-core.server");
          const input = body.data ?? {};
          switch (op) {
            case "overview":
              return Response.json(await core.overviewCore(rangeSchema.parse(input)));
            case "activityFeed":
              return Response.json(
                await core.activityFeedCore(filterSchema.parse(input), true),
              );
            case "visitorDirectory":
              return Response.json(
                await core.visitorDirectoryCore(directorySchema.parse(input)),
              );
            case "userFootprint":
              return Response.json(await core.userFootprintCore(footprintSchema.parse(input)));
            case "securitySignals":
              return Response.json(await core.securitySignalsCore(rangeSchema.parse(input)));
            case "exportCsv":
              return Response.json(await core.exportCsvCore(filterSchema.parse(input)));
            case "retention":
              return Response.json(
                await core.retentionCore(retentionSchema.parse(input), userId, true),
              );
          }
          return Response.json({ error: "Unknown operation" }, { status: 400 });
        } catch (err) {
          console.error("[analytics-admin] failed", err);
          return Response.json({ error: "Analytics is unavailable." }, { status: 500 });
        }
      },
    },
  },
});
