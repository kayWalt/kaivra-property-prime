import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Reveals the full bank account number for one developer payment account.
 *
 * Authorisation is explicit: the caller's own RLS-scoped client must show an
 * administrator role for them. Only then is the withheld column read with the
 * service-role client (clients hold no read grant on it at all). Returns `null`
 * when this deployment carries no service-role secret, so callers can relay to
 * the Lovable-hosted origin instead of failing.
 */
export async function resolvePaymentAccountNumber(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
): Promise<string | null | "forbidden"> {
  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (roleError) return "forbidden";
  const isAdmin = (roles ?? []).some((r) => r.role === "admin" || r.role === "super_admin");
  if (!isAdmin) return "forbidden";

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("developer_payment_accounts")
      .select("account_number")
      .eq("id", accountId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { account_number: string }).account_number;
  } catch (err) {
    console.error("[payment-accounts] reveal unavailable", err);
    return null;
  }
}
