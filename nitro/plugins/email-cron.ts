import { definePlugin } from "nitro";

/**
 * KAIVRA scheduled email relay (Cloudflare Cron Trigger entry point).
 *
 * Cloudflare invokes the Worker's scheduled() handler on the Cron Trigger
 * configured for kaivra-property-prime (every 15 minutes, see the generated
 * wrangler config). The Worker does NOT run the email processors itself:
 * privileged Supabase access (SUPABASE_SERVICE_ROLE_KEY) only exists inside
 * Lovable Cloud, so this handler relays the run to the protected Lovable
 * Cloud endpoint, which executes scanPaymentReminders() -> processPromotions()
 * -> processQueue(60) server-side.
 *
 * Authentication: Authorization: Bearer <KAIVRA_CRON_RELAY_SECRET>, read from
 * a Cloudflare Worker secret binding at runtime. The secret is never
 * hardcoded, never logged, and never present in source control.
 *
 * Idempotency lives in the database (email_outbox dedupe keys), so repeated
 * or overlapping cron runs cannot double-send. EMAIL_TEST_MODE stays enabled
 * on the Lovable side; no real investor email can be sent while it is on.
 */
const ENDPOINT = "https://kaivraa-com.lovable.app/api/public/email-cron";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async () => {
    const secret = process.env["KAIVRA_CRON_RELAY_SECRET"];
    if (!secret) {
      console.error(
        "[email-cron] KAIVRA_CRON_RELAY_SECRET is not configured on the Cloudflare Worker; skipping scheduled email run.",
      );
      return;
    }
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
      });
      const bodyText = await res.text().catch(() => "");
      // Log only safe diagnostics; never the Authorization header or secret.
      let summary: unknown = bodyText.slice(0, 500);
      try {
        summary = JSON.parse(bodyText);
      } catch {
        // keep the truncated text
      }
      if (res.ok) {
        console.log(`[email-cron] relay ok: status=${res.status} result=${JSON.stringify(summary)}`);
      } else {
        console.error(`[email-cron] relay failed: status=${res.status} body=${JSON.stringify(summary)}`);
      }
    } catch (error) {
      console.error("[email-cron] relay request failed", error);
    }
  });
});
