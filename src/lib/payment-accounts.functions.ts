import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LOVABLE_ORIGIN, isLovableOrigin } from "./origin-fallback";

/**
 * Administrator-only reveal of a full developer bank account number.
 *
 * The database withholds the column from every client role, so the value can
 * only be read server-side after the caller's administrator role is verified.
 */
export const revealPaymentAccountNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ accountId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ accountNumber: string }> => {
    const { resolvePaymentAccountNumber } = await import("./payment-accounts.server");
    const result = await resolvePaymentAccountNumber(
      context.supabase as never,
      context.userId,
      data.accountId,
    );
    if (result === "forbidden") {
      throw new Error("You are not authorised to view this account number.");
    }
    if (typeof result === "string") return { accountNumber: result };

    // Reveal unavailable locally (custom domain without service-role secret) —
    // relay to the Lovable-hosted origin with the caller's own credentials.
    try {
      const request = getRequest();
      if (request && !isLovableOrigin(request)) {
        const auth = request.headers.get("authorization");
        if (auth) {
          const res = await fetch(`${LOVABLE_ORIGIN}/api/public/payment-account-number`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({ accountId: data.accountId }),
          });
          if (res.ok) return (await res.json()) as { accountNumber: string };
        }
      }
    } catch (err) {
      console.error("[payment-accounts] reveal relay failed", err);
    }

    throw new Error("This account number could not be loaded.");
  });
