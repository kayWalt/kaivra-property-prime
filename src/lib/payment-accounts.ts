import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Developer/company bank accounts investors pay into.
 *
 * The client can only ever read the masked last four digits: the full account
 * number is withheld by column-level grants in the database and revealed to
 * administrators only by the `revealPaymentAccountNumber` server function.
 */
export interface PaymentAccount {
  id: string;
  developer_name: string;
  bank_name: string;
  account_name: string;
  account_last4: string | null;
  description: string | null;
  status: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Snapshot stored on each payment so history survives account changes. */
export interface PaymentAccountSnapshot {
  account_id?: string;
  developer_name?: string;
  bank_name?: string;
  account_name?: string;
  masked_account_number?: string;
  captured_at?: string;
}

export const ACCOUNT_COLUMNS =
  "id, developer_name, bank_name, account_name, account_last4, description, status, archived_at, created_at, updated_at";

export function maskAccount(last4: string | null | undefined) {
  return last4 ? `****${last4}` : "****";
}

export function accountLabel(account: PaymentAccount) {
  return `${account.developer_name} — ${account.bank_name} — ${maskAccount(account.account_last4)}`;
}

export function snapshotLabel(value: unknown): string | null {
  const snap = value as PaymentAccountSnapshot | null;
  if (!snap || typeof snap !== "object" || !snap.developer_name) return null;
  return `${snap.developer_name} — ${snap.bank_name ?? "—"} — ${snap.masked_account_number ?? "****"}`;
}

/** Active, non-archived accounts an investor may select for a new payment. */
export function useActivePaymentAccounts() {
  return useQuery({
    queryKey: ["payment-accounts", "active"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developer_payment_accounts")
        .select(ACCOUNT_COLUMNS)
        .eq("status", "active")
        .is("archived_at", null)
        .order("developer_name");
      if (error) throw error;
      return (data ?? []) as PaymentAccount[];
    },
  });
}
