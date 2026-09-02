import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { ReferenceChip } from "@/components/kaivra/ReferenceChip";
import { ToneBadge } from "@/components/kaivra/StatusBadge";
import { useRoles, useSession, primaryRole } from "@/hooks/useAuth";
import { formatDate } from "@/lib/kaivra";
import {
  CORRECTION_STATUSES,
  CORRECTION_STATUS_LABEL,
  correctionTone,
  fieldLabelOf,
  sectionOf,
  type CorrectionRequestRow,
  type CorrectionStatus,
} from "@/lib/corrections";
import {
import { RequireModule } from "@/components/kaivra/RequireModule";
  applyCorrectionRequest,
  getCorrectionDocumentUrl,
  manageCorrectionRequest,
} from "@/lib/corrections.functions";

export const Route = createFileRoute("/_authenticated/admin/corrections")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Correction Requests" },
      {
        name: "description",
        content: "Review, approve and apply investor correction requests with a full audit trail.",
      },
      { property: "og:title", content: "KAIVRA | Correction Requests" },
      { property: "og:description", content: "Investor correction request workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireModule module="corrections">
      <AdminCorrections />
    </RequireModule>
  ),
});

type Row = CorrectionRequestRow & { admin_note: string | null };

function AdminCorrections() {
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const role = primaryRole(roles);
  const isAdmin = role === "admin" || role === "super_admin";
  const queryClient = useQueryClient();

  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [since, setSince] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [confirming, setConfirming] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");

  const requests = useQuery({
    queryKey: ["admin-corrections"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("correction_requests")
        .select(
          "id, reference, investor_id, application_id, section, field_label, current_value, requested_value, reason, status, investor_response, admin_response, admin_note, resolution_details, acknowledged_at, applied_at, resolved_at, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const investorIds = useMemo(
    () => Array.from(new Set((requests.data ?? []).map((r) => r.investor_id))),
    [requests.data],
  );

  const investors = useQuery({
    queryKey: ["correction-investors", investorIds.join(",")],
    enabled: investorIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, investor_code")
        .in("id", investorIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const attachments = useQuery({
    queryKey: ["correction-docs", selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("correction_request_documents")
        .select("id, file_name, created_at")
        .eq("correction_request_id", selected!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const investorOf = (id: string) => investors.data?.find((p) => p.id === id);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = requests.data ?? [];
    if (status === "open") list = list.filter((r) => !["resolved", "applied", "rejected"].includes(r.status));
    else if (status !== "all") list = list.filter((r) => r.status === status);
    if (since) list = list.filter((r) => new Date(r.created_at) >= new Date(since));
    if (term) {
      list = list.filter((r) => {
        const inv = investorOf(r.investor_id);
        return [r.reference, r.field_label, r.section, inv?.full_name, inv?.email, inv?.investor_code]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term));
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests.data, status, search, since, investors.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-corrections"] });
  };

  async function act(
    row: Row,
    action: "acknowledge" | "under_review" | "request_info" | "approve" | "reject" | "resolve",
  ) {
    await manageCorrectionRequest({
      data: {
        id: row.id,
        action,
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(note.trim() ? { internalNote: note.trim() } : {}),
      },
    });
    toast.success("Correction request updated.");
    setMessage("");
    setNote("");
    setSelected(null);
    refresh();
  }

  if (!isAdmin && role !== "adviser") {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-3xl">Not authorised</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Investor requests</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Correction requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review, approve and apply corrections. Every change is recorded in the audit trail.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Reference, investor, email or ID"
              className="w-64 pl-8"
              aria-label="Search correction requests"
            />
          </div>
          <Input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="w-40"
            aria-label="From date"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="all">All</SelectItem>
              {CORRECTION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {CORRECTION_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {requests.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />) : null}
        {!requests.isLoading && rows.length === 0 ? (
          <EmptyState title="No correction requests." body="Nothing matches these filters." />
        ) : null}
        {rows.map((row) => {
          const inv = investorOf(row.investor_id);
          return (
            <article
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ReferenceChip label="Correction" value={row.reference} size="sm" />
                  <ToneBadge
                    tone={correctionTone(row.status as CorrectionStatus)}
                    label={CORRECTION_STATUS_LABEL[row.status as CorrectionStatus] ?? row.status}
                  />
                </div>
                <p className="mt-2 text-sm font-medium">
                  {inv?.full_name ?? "Investor"} · {inv?.investor_code ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sectionOf(row.section)?.label ?? row.section} ·{" "}
                  {fieldLabelOf(row.section, row.field_label)} · {formatDate(row.created_at)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelected(row);
                  setMessage("");
                  setNote(row.admin_note ?? "");
                }}
              >
                Open
              </Button>
            </article>
          );
        })}
      </div>

      {/* Detail / workflow */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.reference}</DialogTitle>
                <DialogDescription>
                  {investorOf(selected.investor_id)?.full_name ?? "Investor"} ·{" "}
                  {investorOf(selected.investor_id)?.email ?? "—"}
                </DialogDescription>
              </DialogHeader>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="eyebrow text-muted-foreground">Section / field</dt>
                  <dd>
                    {sectionOf(selected.section)?.label} ·{" "}
                    {fieldLabelOf(selected.section, selected.field_label)}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Status</dt>
                  <dd>
                    {CORRECTION_STATUS_LABEL[selected.status as CorrectionStatus] ?? selected.status}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Current value</dt>
                  <dd className="break-words">{selected.current_value || "—"}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Requested value</dt>
                  <dd className="break-words">{selected.requested_value}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="eyebrow text-muted-foreground">Reason</dt>
                  <dd className="break-words">{selected.reason}</dd>
                </div>
                {selected.investor_response ? (
                  <div className="sm:col-span-2">
                    <dt className="eyebrow text-muted-foreground">Investor response</dt>
                    <dd className="break-words">{selected.investor_response}</dd>
                  </div>
                ) : null}
              </dl>

              {attachments.data?.length ? (
                <div>
                  <p className="eyebrow text-muted-foreground">Supporting documents</p>
                  <ul className="mt-2 space-y-1">
                    {attachments.data.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{doc.file_name}</span>
                        <AsyncButton
                          size="sm"
                          variant="ghost"
                          pendingLabel="Opening…"
                          onClick={async () => {
                            const res = await getCorrectionDocumentUrl({
                              data: { documentId: doc.id },
                            });
                            window.open(res.url, "_blank", "noopener,noreferrer");
                          }}
                        >
                          <Eye className="mr-2 size-4" /> View
                        </AsyncButton>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {isAdmin ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cr-msg">Message to the investor</Label>
                    <Textarea
                      id="cr-msg"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cr-note">Internal note (staff only)</Label>
                    <Textarea
                      id="cr-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <AsyncButton size="sm" variant="outline" onClick={() => act(selected, "acknowledge")}>
                      Acknowledge
                    </AsyncButton>
                    <AsyncButton size="sm" variant="outline" onClick={() => act(selected, "under_review")}>
                      Under review
                    </AsyncButton>
                    <AsyncButton size="sm" variant="outline" onClick={() => act(selected, "request_info")}>
                      Request more info
                    </AsyncButton>
                    <AsyncButton size="sm" onClick={() => act(selected, "approve")}>
                      Approve
                    </AsyncButton>
                    <AsyncButton size="sm" variant="destructive" onClick={() => act(selected, "reject")}>
                      Reject
                    </AsyncButton>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setConfirming(selected);
                        setResolution("");
                      }}
                    >
                      Apply correction
                    </Button>
                    <AsyncButton size="sm" variant="outline" onClick={() => act(selected, "resolve")}>
                      Resolve
                    </AsyncButton>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only KAIVRA administrators can process correction requests.
                </p>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Apply-correction confirmation */}
      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {confirming ? (
            <>
              <DialogHeader>
                <DialogTitle>Confirm correction</DialogTitle>
                <DialogDescription>
                  The original value is preserved in the audit trail before anything changes.
                </DialogDescription>
              </DialogHeader>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="eyebrow text-muted-foreground">Before</dt>
                  <dd className="break-words">{confirming.current_value || "—"}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Requested change</dt>
                  <dd className="break-words">{confirming.requested_value}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Reason</dt>
                  <dd className="break-words">{confirming.reason}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Admin</dt>
                  <dd>{user?.email ?? "—"}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Date / time</dt>
                  <dd>{new Date().toLocaleString("en-GB")}</dd>
                </div>
              </dl>
              <div className="space-y-1.5">
                <Label htmlFor="cr-res">Resolution note</Label>
                <Textarea
                  id="cr-res"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={3}
                />
              </div>
              <DialogFooter>
                <AsyncButton
                  pendingLabel="Applying…"
                  onClick={async () => {
                    const column = sectionOf(confirming.section)?.column ?? null;
                    await applyCorrectionRequest({
                      data: {
                        id: confirming.id,
                        column,
                        fieldKey: column ? confirming.field_label : null,
                        ...(resolution.trim() ? { resolutionNote: resolution.trim() } : {}),
                      },
                    });
                    toast.success("Correction applied and recorded.");
                    setConfirming(null);
                    setSelected(null);
                    refresh();
                  }}
                >
                  Confirm and apply
                </AsyncButton>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
