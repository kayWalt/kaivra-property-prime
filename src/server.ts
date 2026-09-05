import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Runs the existing KAIVRA email processors (payment reminders, promotion
 * lifecycle, queue sending). Shared by the Cloudflare Cron `scheduled` handler
 * and never crosses HTTP, so no cron secret is needed for scheduled runs —
 * Cloudflare invokes the Worker's scheduled() handler directly.
 */
async function runEmailProcessors(): Promise<void> {
  const { scanPaymentReminders, processPromotions, processQueue } = await import(
    "./lib/email.server"
  );
  const reminders = await scanPaymentReminders();
  const promotions = await processPromotions();
  const queue = await processQueue(60);
  console.log(
    `[email-cron] scheduled run complete: reminders=${JSON.stringify(reminders)} promotions=${JSON.stringify(promotions)} queue=${JSON.stringify(queue)}`,
  );
}

type ExecutionContextLike = { waitUntil: (promise: Promise<unknown>) => void };

export default {
  /**
   * Cloudflare Cron Trigger entry point. Configure a Cron Trigger on the
   * kaivra-property-prime Worker (recommended: every 15 minutes) and Cloudflare
   * invokes this handler directly — the /api/public/email-cron HTTP endpoint
   * stays protected by the shared cron bearer secret and is only a fallback
   * for external schedulers. Idempotency lives in the database, so repeated
   * or overlapping runs cannot double-send.
   */
  scheduled(_event: unknown, _env: unknown, ctx: ExecutionContextLike) {
    ctx.waitUntil(
      runEmailProcessors().catch((error) => {
        console.error("[email-cron] scheduled run failed", error);
      }),
    );
  },

  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
