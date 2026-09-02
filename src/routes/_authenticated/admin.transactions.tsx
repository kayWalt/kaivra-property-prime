import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { PaymentBadge } from "@/components/kaivra/StatusBadge";
import { openDocument } from "@/components/kaivra/FileUpload";
import { useProfile, useRoles, useSession, primaryRole, isStaffRole } from "@/hooks/useAuth";
import { logEvent, notify } from "@/lib/applications";
import { snapshotLabel } from "@/lib/payment-accounts";
import { formatDate, formatNaira, type PaymentStatus } from "@/lib/kaivra";
import { RequireModule } from "@/components/kaivra/RequireModule";

export const Route = createFileRoute("/_authenticated/admin/transactions")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Transactions" },
      {
        name: "description",
        content: "Review, verify and export every investor payment recorded on KAIVRA.",
      },
      { property: "og:title", content: "KAIVRA | Transactions" },
      { property: "og:description", content: "Complete investor transaction history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireModule module="transactions" allowAdviser>
      <AdminTransactions />
    </RequireModule>
  ),
});

type Row = {
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
  verified_by: string | null;
  rejection_reason: string | null;
  payment_account_snapshot?: unknown;

  application_id: string;
  applications: {
    id: string;
    reference: string | null;
    investor_id: string;
    personal: { full_name?: string } | null;
    projects: { id: string; name: string } | null;
    properties: { name: string } | null;
  } | null;
};

function AdminTransactions() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const staff = isStaffRole(primaryRole(roles));
  const queryClient = useQueryClient();

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [project, setProject] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const [note, setNote] = useState("");

  const list = useQuery({
    queryKey: ["admin-transactions", status, from, to],
    enabled: staff,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("application_payments")
        .select(
          "id, amount, paid_on, created_at, bank, sender, reference, payment_reference, method, description, status, verified_at, verified_by, rejection_reason, application_id, payment_account_snapshot, applications!inner(id, reference, investor_id, personal, projects(id, name), properties(name))",
        )
        .order("paid_on", { ascending: false, nullsFirst: false })
        .limit(300);
      if (status !== "all") q = q.eq("status", status as PaymentStatus);
      if (from) q = q.gte("paid_on", from);
      if (to) q = q.lte("paid_on", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const proofs = useQuery({
    queryKey: ["admin-payment-proofs", open?.id],
    enabled: !!open?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("application_documents")
        .select("id, file_name")
        .eq("payment_id", open!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    (list.data ?? []).forEach((r) => {
      if (r.applications?.projects)
        map.set(r.applications.projects.id, r.applications.projects.name);
    });
    return [...map.entries()];
  }, [list.data]);

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return (list.data ?? []).filter((r) => {
      if (project !== "all" && r.applications?.projects?.id !== project) return false;
      if (!needle) return true;
      return `${r.payment_reference ?? ""} ${r.reference ?? ""} ${r.bank ?? ""} ${r.sender ?? ""} ${r.applications?.reference ?? ""} ${r.applications?.personal?.full_name ?? ""} ${r.applications?.projects?.name ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [list.data, term, project]);

  const totals = useMemo(() => {
    const verified = rows
      .filter((r) => r.status === "verified")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const pending = rows
      .filter((r) => r.status === "pending")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return { verified, pending, count: rows.length };
  }, [rows]);

  function exportCsv() {
    const header = [
      "Date",
      "Investor",
      "Project",
      "Property",
      "Application",
      "Amount",
      "Method",
      "Bank",
      "Sender",
      "Payment reference",
      "Bank reference",
      "Status",
      "Verified date",
    ];
    const body = rows.map((r) => [
      r.paid_on ?? r.created_at,
      r.applications?.personal?.full_name ?? "",
      r.applications?.projects?.name ?? "",
      r.applications?.properties?.name ?? "",
      r.applications?.reference ?? "",
      String(r.amount ?? 0),
      r.method,
      r.bank ?? "",
      r.sender ?? "",
      r.payment_reference ?? "",
      r.reference ?? "",
      r.status,
      r.verified_at ?? "",
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `KAIVRA-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function decide(row: Row, next: "verified" | "rejected") {
    const { error } = await supabase
      .from("application_payments")
      .update({
        status: next,
        verified_by: user?.id ?? null,
        verified_at: new Date().toISOString(),
        rejection_reason: next === "rejected" ? note || "Payment could not be verified." : null,
      })
      .eq("id", row.id);
    if (error) {
      toast.error("The payment could not be updated. Please try again.");
      return;
    }
    await Promise.all([
      logEvent(
        row.application_id,
        next === "verified" ? "payment_verified" : "payment_rejected",
        `${formatNaira(row.amount)}${note ? ` · ${note}` : ""}`,
        profile?.full_name ?? undefined,
      ),
      row.applications?.investor_id
        ? notify(
            row.applications.investor_id,
            next === "verified" ? "Payment verified" : "Payment rejected",
            next === "verified"
              ? `Your payment of ${formatNaira(row.amount)} has been verified.`
              : `Your payment of ${formatNaira(row.amount)} was rejected. ${note}`,
            "/transactions",
          )
        : Promise.resolve(),
    ]);
    queryClient.invalidateQueries({ queryKey: ["admin-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["my-transactions"] });
    toast.success(next === "verified" ? "Payment verified." : "Payment rejected.");
    setOpen(null);
    setNote("");
  }

  if (rolesLoading) return <Skeleton className="mx-auto mt-10 h-40 w-full max-w-6xl" />;
  if (!staff) {
    return (
      <EmptyState
        title="Not available"
        body="This workspace is for KAIVRA advisers and administrators."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Finance</p>
          <h1 className="mt-2 font-display text-4xl">Transactions</h1>
        </div>
        <AsyncButton variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-2 size-4" /> Export transactions
        </AsyncButton>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Transactions", String(totals.count)],
          ["Verified value", formatNaira(totals.verified)],
          ["Awaiting verification", formatNaira(totals.pending)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="eyebrow text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          className="lg:col-span-2"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search KAIVRA reference, investor, bank"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger>
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projectOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
          />
        </div>
      </div>

      {list.isLoading ? (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No transactions found"
            body="Adjust your filters to see recorded payments."
          />
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b border-border bg-muted/50 text-left">
              <tr>
                {["Date", "Investor", "Project", "Amount", "Method", "Status", ""].map((h) => (
                  <th key={h} className="eyebrow px-4 py-3 text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-accent/30">
                  <td className="px-4 py-3">{formatDate(r.paid_on ?? r.created_at)}</td>
                  <td className="px-4 py-3">{r.applications?.personal?.full_name ?? "—"}</td>
                  <td className="px-4 py-3">{r.applications?.projects?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold">{formatNaira(r.amount)}</td>
                  <td className="px-4 py-3 capitalize">{r.method.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <PaymentBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setOpen(r);
                        setNote(r.rejection_reason ?? "");
                      }}
                    >
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="divide-y divide-border md:hidden">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setOpen(r);
                  setNote(r.rejection_reason ?? "");
                }}
                className="w-full p-4 text-left active:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{formatNaira(r.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.applications?.personal?.full_name ?? "—"} ·{" "}
                      {formatDate(r.paid_on ?? r.created_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.applications?.projects?.name ?? "—"}
                    </p>
                  </div>
                  <PaymentBadge status={r.status} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Payment details</DialogTitle>
          </DialogHeader>
          {open ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ["Investor", open.applications?.personal?.full_name ?? "—"],
                  ["Application", open.applications?.reference ?? "—"],
                  ["Project", open.applications?.projects?.name ?? "—"],
                  ["Property", open.applications?.properties?.name ?? "—"],
                  ["Amount", formatNaira(open.amount)],
                  ["Payment date", formatDate(open.paid_on ?? open.created_at)],
                  ["Method", open.method.replace(/_/g, " ")],
                  ["Bank", open.bank ?? "—"],
                  ["Account paid into", snapshotLabel(open.payment_account_snapshot) ?? "—"],
                  ["Sender", open.sender ?? "—"],
                  ["Payment reference", open.payment_reference ?? "—"],
                  ["Bank reference", open.reference ?? "—"],
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
              <div className="flex flex-wrap gap-2">
                {(proofs.data ?? []).map((doc) => (
                  <AsyncButton
                    key={doc.id}
                    size="sm"
                    variant="outline"
                    onClick={() => openDocument(doc.id)}
                  >
                    <Eye className="mr-2 size-4" /> View proof of payment
                  </AsyncButton>
                ))}
              </div>
              <div>
                <Label htmlFor="verification-note">Verification note</Label>
                <Textarea
                  id="verification-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <AsyncButton
                  size="sm"
                  onClick={() => decide(open, "verified")}
                  pendingLabel="Verifying…"
                >
                  Verify payment
                </AsyncButton>
                <AsyncButton size="sm" variant="outline" onClick={() => decide(open, "rejected")}>
                  Reject payment
                </AsyncButton>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
