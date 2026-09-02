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

export const Route = createFileRoute("/api/public/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.json();
          const parsed = bodySchema.safeParse(raw);
          if (!parsed.success) return new Response("ok", { status: 202 });
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
