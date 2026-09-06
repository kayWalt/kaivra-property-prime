import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CLIENT_EVENT_TYPES } from "@/lib/analytics";

/**
 * Public collector for the KAIVRA digital footprint.
 *
 * Anyone can post here (anonymous visitors must be counted), so the handler
 * treats the body as untrusted: the event type is allowlisted, strings are
 * length-capped, the actor is resolved from the bearer token rather than the
 * body, and country / IP-hash are derived server-side. It never returns data.
 */
const bodySchema = z.object({
  eventType: z.enum(CLIENT_EVENT_TYPES as unknown as [string, ...string[]]),
  sessionId: z.string().min(8).max(60),
  visitorId: z.string().min(8).max(60),
  route: z.string().max(300).optional(),
  referrer: z.string().max(300).optional(),
  locale: z.string().max(20).optional(),
  screenWidth: z.number().int().min(0).max(10_000).optional(),
  isReturning: z.boolean().optional(),
  result: z.enum(["success", "failure"]).optional(),
  metadata: z.record(z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});

/**
 * Header set on a relayed request so the Lovable-hosted copy of this same
 * route never forwards again (loop guard).
 */
const RELAY_HEADER = "x-kaivra-track-relay";

/** Headers that carry the visitor context this collector derives server-side. */
const FORWARDED = [
  "authorization",
  "user-agent",
  "cf-connecting-ip",
  "x-forwarded-for",
  "cf-ipcountry",
  "cf-region",
];

export const Route = createFileRoute("/api/public/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.json();
          const parsed = bodySchema.safeParse(raw);
          if (!parsed.success) return new Response("ok", { status: 202 });

          // The Cloudflare-hosted frontend deliberately has no
          // SUPABASE_SERVICE_ROLE_KEY, so the privileged write cannot run
          // there. Relay the already-validated payload to the Lovable Cloud
          // backend, which holds the key, preserving the visitor headers this
          // collector classifies from. Never relay a relayed request.
          const relayed = request.headers.get(RELAY_HEADER) === "1";
          if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] && !relayed) {
            const { LOVABLE_ORIGIN } = await import("@/lib/origin-fallback");
            const origin = process.env["LOVABLE_BACKEND_URL"]?.trim() || LOVABLE_ORIGIN;
            const headers = new Headers({
              "Content-Type": "application/json",
              [RELAY_HEADER]: "1",
            });
            for (const name of FORWARDED) {
              const value = request.headers.get(name);
              if (value) headers.set(name, value);
            }
            const res = await fetch(`${origin}/api/public/track`, {
              method: "POST",
              headers,
              body: JSON.stringify(parsed.data),
            });
            if (!res.ok) console.error("[analytics] relay responded", res.status);
            return new Response("ok", { status: 202 });
          }

          const { ingestEvent } = await import("@/lib/analytics.server");
          await ingestEvent(parsed.data, request.headers);
        } catch (err) {
          console.error("[analytics] ingest failed", err);
        }
        return new Response("ok", { status: 202 });
      },
    },
  },
});
