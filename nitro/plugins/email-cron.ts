import { definePlugin } from "nitro";

/**
 * KAIVRA scheduled email processor (Cloudflare Cron Trigger entry point).
 *
 * Cloudflare invokes the Worker's scheduled() handler on the Cron Trigger
 * configured for kaivra-property-prime (every 15 minutes, see the generated
 * wrangler config). Nitro forwards that event to the "cloudflare:scheduled"
 * hook registered here, which runs the EXISTING email processors directly —
 * no HTTP hop, so no cron secret is needed for scheduled runs. The protected
 * POST /api/public/email-cron endpoint remains unchanged as a fallback for
 * external schedulers.
 *
 * Each run: payment reminder scan -> promotion lifecycle -> queue sending.
 * Duplicate protection lives in the database (email_outbox dedupe keys), so
 * repeated, retried, or overlapping runs cannot double-send. EMAIL_TEST_MODE
 * stays enabled; no real investor email can be sent while it is on.
 */
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async () => {
    try {
      const { scanPaymentReminders, processPromotions, processQueue } = await import(
        "../../src/lib/email.server"
      );
      const reminders = await scanPaymentReminders();
      const promotions = await processPromotions();
      const queue = await processQueue(60);
      console.log(
        `[email-cron] scheduled run complete: reminders=${JSON.stringify(reminders)} promotions=${JSON.stringify(promotions)} queue=${JSON.stringify(queue)}`,
      );
    } catch (error) {
      console.error("[email-cron] scheduled run failed", error);
    }
  });
});
