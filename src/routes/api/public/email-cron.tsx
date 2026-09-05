import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled worker for the KAIVRA email system.
 *
 * Called by the platform scheduler (or any external cron, e.g. a Cloudflare
 * Worker cron trigger) with the shared cron bearer secret. Unauthenticated
 * callers get 401 — the route sits under /api/public only so the scheduler can
 * reach it, never because it is open.
 *
 * Each run: scans existing applications/payments for outstanding balances,
 * then sends whatever is pending in the queue. Duplicate protection lives in
 * the database, so repeated or overlapping runs cannot double-send.
 */
export const Route = createFileRoute("/api/public/email-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        try {
          const { scanPaymentReminders, processQueue, processPromotions } = await import(
            "@/lib/email.server"
          );
          const reminders = await scanPaymentReminders();
          const promotions = await processPromotions();
          const queue = await processQueue(60);
          return Response.json({ ok: true, reminders, promotions, queue });
        } catch (err) {
          console.error("[email-cron] run failed", err);
          return Response.json({ error: "Email run failed." }, { status: 500 });
        }
      },
    },
  },
});
