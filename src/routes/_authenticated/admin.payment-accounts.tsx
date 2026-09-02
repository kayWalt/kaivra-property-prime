import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Archive, Eye, History, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { EmptyState } from "@/components/kaivra/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRoles, useSession, primaryRole } from "@/hooks/useAuth";
import { formatDate } from "@/lib/kaivra";
import { ACCOUNT_COLUMNS, maskAccount, type PaymentAccount } from "@/lib/payment-accounts";

export const Route = createFileRoute("/_authenticated/admin/payment-accounts")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Developer Payment Accounts" },
      {
        name: "description",
        content: "Manage the developer bank accounts investors can pay into on KAIVRA.",
      },
      { property: "og:title", content: "KAIVRA | Developer Payment Accounts" },
      { property: "og:description", content: "KAIVRA administrator payment account workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPaymentAccounts,
});

type AuditRow = {
  id: string;
  payment_account_id: string | null;
  admin_email: string | null;
  action: string;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

const EMPTY_FORM = {
  developer_name: "",
  bank_name: "",
  account_name: "",
  account_number: "",
  description: "",
};

const ACTION_LABEL: Record<string, string> = {
  account_created: "Created",
  account_edited: "Edited",
  account_activated: "Activated",
  account_deactivated: "Deactivated",
  account_archived: "Archived",
  account_restored: "Restored",
};

function AdminPaymentAccounts() {
  const { user } = useSession();
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const role = primaryRole(roles);
  const isAdmin = role === "admin" || role === "super_admin";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [confirm, setConfirm] = useState<{
    account: PaymentAccount;
    mode: "deactivate" | "activate" | "archive" | "restore";
  } | null>(null);
  const [auditFor, setAuditFor] = useState<PaymentAccount | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const accounts = useQuery({
    queryKey: ["payment-accounts", "all"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developer_payment_accounts")
        .select(`${ACCOUNT_COLUMNS}, created_by, updated_by`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as (PaymentAccount & {
        created_by: string | null;
        updated_by: string | null;
      })[];
    },
  });

  const staff = useQuery({
    queryKey: ["payment-accounts", "staff-names"],
    enabled: isAdmin,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.id] = p.full_name || p.email || p.id;
      return map;
    },
  });

  const usage = useQuery({
    queryKey: ["payment-accounts", "usage"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("application_payments")
        .select("payment_account_id")
        .not("payment_account_id", "is", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const id = row.payment_account_id as string | null;
        if (id) counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const audit = useQuery({
    queryKey: ["payment-account-audit", auditFor?.id],
    enabled: isAdmin && !!auditFor?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_account_audit_log")
        .select("id, payment_account_id, admin_email, action, previous_values, new_values, created_at")
        .eq("payment_account_id", auditFor!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = accounts.data ?? [];
    if (!term) return list;
    return list.filter((a) =>
      [a.developer_name, a.bank_name, a.account_name, a.account_last4 ?? "", a.status]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [accounts.data, search]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["payment-accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["payment-account-audit"] });
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setEditing(null);
    setCreating(true);
  }

  function openEdit(account: PaymentAccount) {
    setForm({
      developer_name: account.developer_name,
      bank_name: account.bank_name,
      account_name: account.account_name,
      account_number: "",
      description: account.description ?? "",
    });
    setEditing(account);
    setCreating(true);
  }

  async function save() {
    if (!form.developer_name.trim() || !form.bank_name.trim() || !form.account_name.trim()) {
      toast.error("Developer, bank and account name are required.");
      return;
    }
    if (!editing && !/^\d{6,20}$/.test(form.account_number.trim())) {
      toast.error("Enter a valid account number (digits only).");
      return;
    }
    if (editing && form.account_number.trim() && !/^\d{6,20}$/.test(form.account_number.trim())) {
      toast.error("Enter a valid account number (digits only).");
      return;
    }

    const base = {
      developer_name: form.developer_name.trim(),
      bank_name: form.bank_name.trim(),
      account_name: form.account_name.trim(),
      description: form.description.trim() || null,
    };

    const { error } = editing
      ? await supabase
          .from("developer_payment_accounts")
          .update(
            form.account_number.trim()
              ? { ...base, account_number: form.account_number.trim() }
              : base,
          )
          .eq("id", editing.id)
      : await supabase
          .from("developer_payment_accounts")
          .insert({ ...base, account_number: form.account_number.trim() });

    if (error) {
      toast.error(`The payment account could not be saved. ${error.message}`);
      return;
    }
    toast.success(editing ? "Payment account updated." : "Payment account added.");
    setCreating(false);
    setEditing(null);
    refresh();
  }

  async function applyStatus() {
    if (!confirm) return;
    const patch =
      confirm.mode === "deactivate"
        ? { status: "inactive" }
        : confirm.mode === "activate"
          ? { status: "active" }
          : confirm.mode === "archive"
            ? { status: "inactive", archived_at: new Date().toISOString() }
            : { status: "active", archived_at: null };

    const { error } = await supabase
      .from("developer_payment_accounts")
      .update(patch)
      .eq("id", confirm.account.id);
    if (error) {
      toast.error(`This change could not be saved. ${error.message}`);
      return;
    }
    toast.success("Payment account updated.");
    setConfirm(null);
    refresh();
  }

  async function reveal(account: PaymentAccount) {
    try {
      const { accountNumber } = await revealAccountNumber({ data: { accountId: account.id } });
      setRevealed((prev) => ({ ...prev, [account.id]: accountNumber || "—" }));
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "You are not authorised to view this account number.",
      );
    }
  }

  if (rolesLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          title="Administrators only"
          body="Developer payment accounts can only be managed by KAIVRA administrators."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">Finance</p>
          <h1 className="font-display text-3xl sm:text-4xl">Developer Payment Accounts</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Accounts investors can select when submitting a payment. Deactivating or archiving an
            account never affects payments already recorded against it.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 size-4" /> Add account
        </Button>
      </div>

      <div className="relative mt-6 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search developer, bank or account"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search payment accounts"
        />
      </div>

      {accounts.isLoading ? (
        <Skeleton className="mt-6 h-64 w-full" />
      ) : rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No payment accounts yet"
            body="Add the developer bank accounts investors should pay into."
            action={
              <Button onClick={openCreate}>
                <Plus className="mr-2 size-4" /> Add account
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {rows.map((account) => {
            const used = usage.data?.[account.id] ?? 0;
            const archived = !!account.archived_at;
            return (
              <li key={account.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-xl">{account.developer_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {account.bank_name} · {account.account_name}
                    </p>
                    <p className="mt-1 font-mono text-sm">
                      {revealed[account.id] ?? maskAccount(account.account_last4)}
                    </p>
                  </div>
                  <Badge variant={archived ? "outline" : account.status === "active" ? "default" : "secondary"}>
                    {archived ? "Archived" : account.status === "active" ? "Active" : "Inactive"}
                  </Badge>
                </div>

                {account.description ? (
                  <p className="mt-2 text-sm text-muted-foreground">{account.description}</p>
                ) : null}

                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <dt className="eyebrow">Created</dt>
                    <dd>
                      {formatDate(account.created_at)} ·{" "}
                      {staff.data?.[account.created_by ?? ""] ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Last modified</dt>
                    <dd>
                      {formatDate(account.updated_at)} ·{" "}
                      {staff.data?.[account.updated_by ?? ""] ?? "—"}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="eyebrow">Historical payments</dt>
                    <dd>{used} recorded</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(account)}>
                    Edit
                  </Button>
                  <AsyncButton
                    size="sm"
                    variant="ghost"
                    onClick={() => reveal(account)}
                    pendingLabel="Loading…"
                  >
                    <Eye className="mr-2 size-4" /> Reveal number
                  </AsyncButton>
                  <Button size="sm" variant="ghost" onClick={() => setAuditFor(account)}>
                    <History className="mr-2 size-4" /> Audit trail
                  </Button>
                  {archived ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirm({ account, mode: "restore" })}
                    >
                      Restore
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setConfirm({
                            account,
                            mode: account.status === "active" ? "deactivate" : "activate",
                          })
                        }
                      >
                        {account.status === "active" ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirm({ account, mode: "archive" })}
                      >
                        <Archive className="mr-2 size-4" /> Archive
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add / edit */}
      <Dialog open={creating} onOpenChange={(v) => (v ? null : (setCreating(false), setEditing(null)))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit payment account" : "Add payment account"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Leave the account number blank to keep the current one."
                : "Investors will see the developer, bank and the masked account number only."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label htmlFor="dev-name">Developer / company name</Label>
              <Input
                id="dev-name"
                value={form.developer_name}
                onChange={(e) => setForm({ ...form, developer_name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="dev-bank">Bank name</Label>
                <Input
                  id="dev-bank"
                  value={form.bank_name}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="dev-acct-name">Account name</Label>
                <Input
                  id="dev-acct-name"
                  value={form.account_name}
                  onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="dev-acct-number">Account number</Label>
              <Input
                id="dev-acct-number"
                inputMode="numeric"
                autoComplete="off"
                placeholder={editing ? "Unchanged" : "e.g. 0123456789"}
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="dev-desc">Description / reference (optional)</Label>
              <Textarea
                id="dev-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <AsyncButton onClick={() => save()} pendingLabel="Saving…">
              {editing ? "Save changes" : "Add account"}
            </AsyncButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status confirmation */}
      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.mode === "archive"
                ? "Archive this payment account?"
                : confirm?.mode === "deactivate"
                  ? "Deactivate this payment account?"
                  : confirm?.mode === "restore"
                    ? "Restore this payment account?"
                    : "Activate this payment account?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm
                ? confirm.mode === "activate" || confirm.mode === "restore"
                  ? "Investors will be able to select this account for new payments again."
                  : `Investors will no longer be able to select it for new payments. ${
                      (usage.data?.[confirm.account.id] ?? 0) > 0
                        ? `${usage.data?.[confirm.account.id]} historical payment(s) reference this account and will remain fully intact.`
                        : "No historical payments reference this account."
                    }`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void applyStatus()}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Audit trail */}
      <Dialog open={!!auditFor} onOpenChange={(v) => !v && setAuditFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit trail</DialogTitle>
            <DialogDescription>
              Append-only record of every administrator action on {auditFor?.developer_name}.
            </DialogDescription>
          </DialogHeader>
          {audit.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (audit.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            <ul className="space-y-3">
              {(audit.data ?? []).map((entry) => (
                <li key={entry.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {ACTION_LABEL[entry.action] ?? entry.action}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(entry.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.admin_email ?? "Unknown administrator"}
                  </p>
                  {entry.previous_values ? (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[0.7rem]">
                      {JSON.stringify(
                        { before: entry.previous_values, after: entry.new_values },
                        null,
                        2,
                      )}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
