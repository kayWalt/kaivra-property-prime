import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Eye, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { PaymentBadge } from "@/components/kaivra/StatusBadge";
import { ReferenceChip } from "@/components/kaivra/ReferenceChip";
import { openDocument } from "@/components/kaivra/FileUpload";
import { useProfile, useSession } from "@/hooks/useAuth";
import { downloadPaymentReceipt } from "@/lib/receipt";
import { snapshotLabel } from "@/lib/payment-accounts";
import { formatDate, formatNaira, type PaymentStatus } from "@/lib/kaivra";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Payment History" },
      {
        name: "description",
        content: "Every payment you have made towards your KAIVRA investments.",
      },
      { property: "og:title", content: "KAIVRA | Payment History" },
      { property: "og:description", content: "Your complete KAIVRA transaction history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TransactionsPage,
});

export type TxRow = {
  id: string;
  amount: number | string;
  paid_on: string | null;
  created_at: string;
  bank: string | null;
  sender: string | null;
  reference: string | null;
  payment_reference: string | null;
  method: string;
  description: string | null;
  status: PaymentStatus;
  verified_at: string | null;
  rejection_reason: string | null;
  payment_account_snapshot?: unknown;
  applications: {
    id: string;
    reference: string | null;
    investment: { total_value?: number } | null;
    projects: { name: string; currency: string } | null;
    properties: { name: string } | null;
  } | null;
};

export function useMyTransactions(userId?: string, limit = 200) {
  return useQuery({
    queryKey: ["my-transactions", userId, limit],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("application_payments")
        .select(
          "id, amount, paid_on, created_at, bank, sender, reference, payment_reference, method, description, status, verified_at, rejection_reason, payment_account_snapshot, applications!inner(id, reference, investor_id, investment, projects(name, currency), properties(name))",
        )
        .eq("applications.investor_id", userId!)
        .order("paid_on", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as TxRow[];
    },
  });
}

function TransactionsPage() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const tx = useMyTransactions(user?.id);
  const [open, setOpen] = useState<TxRow | null>(null);

  const proofs = useQuery({
    queryKey: ["my-payment-proofs", open?.id],
    enabled: !!open?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("application_documents")
        .select("id, file_name")
        .eq("payment_id", open!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const rows = tx.data ?? [];
    const paid = rows
      .filter((r) => r.status !== "rejected")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const pending = rows
      .filter((r) => r.status === "pending")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return { paid, pending, count: rows.length };
  }, [tx.data]);

  async function receipt(row: TxRow) {
    try {
      await downloadPaymentReceipt({
        investorName: profile?.full_name ?? user?.email ?? "Investor",
        investorCode: profile?.investor_code ?? null,
        project: row.applications?.projects?.name ?? "—",
        property: row.applications?.properties?.name ?? "—",
        applicationReference: row.applications?.reference ?? "—",
        transactionReference: row.payment_reference ?? row.reference ?? "—",
        paidOn: row.paid_on ?? row.created_at,
        amount: row.amount,
        method: row.method,
        bank: row.bank,
        sender: row.sender,
        status: row.status,
        verifiedAt: row.verified_at,
        currency: row.applications?.projects?.currency ?? "NGN",
      });
    } catch {
      toast.error("The receipt could not be generated. Please try again.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <p className="eyebrow text-primary">Finance</p>
      <h1 className="mt-2 font-display text-4xl">Payment history</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Every transaction recorded against your investments.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Transactions", String(summary.count)],
          ["Total paid", formatNaira(summary.paid)],
          ["Awaiting verification", formatNaira(summary.pending)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card p-5">
            <p className="eyebrow text-muted-foreground">{label}</p>
            <p className="mt-2 font-display text-2xl">{value}</p>
          </div>
        ))}
      </div>

      {tx.isLoading ? (
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {tx.isError ? (
        <p className="mt-8 text-sm text-destructive">
          Your transactions could not be loaded. Please refresh.
        </p>
      ) : null}

      {tx.data && tx.data.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No payments recorded yet"
            body="Once you submit a payment against an investment it will appear here."
            action={
              <Button asChild>
                <Link to="/applications">My investments</Link>
              </Button>
            }
          />
        </div>
      ) : null}

      {tx.data && tx.data.length > 0 ? (
        <div className="mt-8 overflow-hidden rounded-lg border border-border bg-card">
          {/* Desktop table */}
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b border-border bg-muted/50">
              <tr className="text-left">
                {["Date", "Reference", "Project", "Amount", "Method", "Status", ""].map((h) => (
                  <th key={h} className="eyebrow px-4 py-3 text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tx.data.map((row) => (
                <tr key={row.id} className="hover:bg-accent/30">
                  <td className="px-4 py-3">{formatDate(row.paid_on ?? row.created_at)}</td>
                  <td className="px-4 py-3">
                    <ReferenceChip size="sm" value={row.payment_reference ?? row.reference} />
                  </td>
                  <td className="px-4 py-3">
                    {row.applications?.projects?.name ?? "—"}
                    <span className="block text-xs text-muted-foreground">
                      {row.applications?.properties?.name ?? ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatNaira(row.amount)}</td>
                  <td className="px-4 py-3 capitalize">{row.method.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <PaymentBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setOpen(row)}>
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="divide-y divide-border md:hidden">
            {tx.data.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setOpen(row)}
                className="w-full p-4 text-left active:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{formatNaira(row.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(row.paid_on ?? row.created_at)} ·{" "}
                      {row.payment_reference ?? row.reference ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.applications?.projects?.name ?? "—"}
                    </p>
                  </div>
                  <PaymentBadge status={row.status} />
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Transaction details</DialogTitle>
          </DialogHeader>
          {open ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ["Payment reference", open.payment_reference ?? "—"],
                  ["Bank reference", open.reference ?? "—"],
                  ["Payment date", formatDate(open.paid_on ?? open.created_at)],
                  ["Amount", formatNaira(open.amount)],
                  ["Method", open.method.replace(/_/g, " ")],
                  ["Bank", open.bank ?? "—"],
                  ["Account paid into", snapshotLabel(open.payment_account_snapshot) ?? "—"],
                  ["Sender", open.sender ?? "—"],
                  ["Application", open.applications?.reference ?? "—"],
                  ["Project", open.applications?.projects?.name ?? "—"],
                  ["Property", open.applications?.properties?.name ?? "—"],
                  ["Verified on", open.verified_at ? formatDate(open.verified_at) : "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="eyebrow text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-semibold capitalize">{value}</dd>
                  </div>
                ))}
              </dl>
              {open.description ? (
                <p className="text-sm text-muted-foreground">{open.description}</p>
              ) : null}
              <PaymentBadge status={open.status} />
              {open.status === "rejected" && open.rejection_reason ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  {open.rejection_reason}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-2">
                {(proofs.data ?? []).map((doc) => (
                  <AsyncButton
                    key={doc.id}
                    variant="outline"
                    size="sm"
                    onClick={() => openDocument(doc.id)}
                  >
                    <Eye className="mr-2 size-4" /> View proof of payment
                  </AsyncButton>
                ))}
                <AsyncButton size="sm" onClick={() => receipt(open)} pendingLabel="Preparing…">
                  <Download className="mr-2 size-4" /> Download receipt
                </AsyncButton>
                {open.applications?.id ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/applications/$appId" params={{ appId: open.applications.id }}>
                      <Receipt className="mr-2 size-4" /> Open investment
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
