import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { acknowledgeComplaint, resolveComplaint } from "@/lib/corrections.functions";
import { EffectCorrectionDialog } from "@/components/kaivra/EffectCorrectionDialog";
import { ArrowLeft, MessageCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { ReferenceChip } from "@/components/kaivra/ReferenceChip";
import { SupportThread } from "@/components/kaivra/SupportChat";
import { useRoles, useSession, primaryRole } from "@/hooks/useAuth";
import { formatDate } from "@/lib/kaivra";
import { buildWhatsAppLink, useSupportSettings } from "@/lib/support-settings";
import {
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABEL,
  updateSupportTicket,
  type SupportStatus,
} from "@/lib/support.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/support")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Support & Live Chat Centre" },
      {
        name: "description",
        content:
          "Answer investor live chats, handle escalations from KAIVRA AI Assist and manage support requests.",
      },
      { property: "og:title", content: "KAIVRA | Support & Live Chat Centre" },
      { property: "og:description", content: "Investor live chat and support escalations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminSupport,
});

type Ticket = {
  id: string;
  reference: string | null;
  subject: string;
  category: string;
  message: string;
  priority: string;
  status: string;
  channel: string | null;
  created_at: string;
  last_message_at: string | null;
  investor_id: string;
  application_id?: string | null;
  assigned_to: string | null;
  applications: { reference: string | null } | null;
  projects: { name: string } | null;
};

const PRIORITY_TONE: Record<string, string> = {
  urgent: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-primary/40 bg-primary/10 text-primary",
};

function AdminSupport() {
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const role = primaryRole(roles);
  const isAdmin = role === "admin" || role === "super_admin";
  const queryClient = useQueryClient();
  const settings = useSupportSettings();
  const [filter, setFilter] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");

  const tickets = useQuery({
    queryKey: ["admin-support-tickets"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(
          "id, reference, subject, category, message, priority, status, channel, created_at, last_message_at, investor_id, application_id, assigned_to, applications(reference), projects(name)",
        )
        .order("last_message_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Ticket[];
    },
  });

  // Live: new investor messages and new requests surface without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel("admin-support-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const investorIds = useMemo(
    () => Array.from(new Set((tickets.data ?? []).map((t) => t.investor_id))),
    [tickets.data],
  );

  const investors = useQuery({
    queryKey: ["support-investors", investorIds.join(",")],
    enabled: investorIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, investor_code")
        .in("id", investorIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const staff = useQuery({
    queryKey: ["support-staff"],
    enabled: isAdmin,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "super_admin", "adviser"]);
      if (error) throw error;
      const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      return profiles ?? [];
    },
  });

  const investorOf = (id: string) => investors.data?.find((p) => p.id === id);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = tickets.data ?? [];
    if (filter === "open") list = list.filter((t) => !["resolved", "closed"].includes(t.status));
    else if (filter !== "all") list = list.filter((t) => t.status === filter);
    if (term) {
      list = list.filter((t) => {
        const investor = investorOf(t.investor_id);
        return [t.subject, t.reference, t.category, investor?.full_name, investor?.email, investor?.investor_code]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term));
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets.data, filter, search, investors.data]);

  const selected = (tickets.data ?? []).find((t) => t.id === selectedId) ?? null;

  const setStatus = async (ticketId: string, status: SupportStatus) => {
    try {
      await updateSupportTicket({ data: { ticketId, status } });
      toast.success("Status updated");
      void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    } catch {
      toast.error("The status could not be updated.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">AI &amp; Support</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Support &amp; live chat</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Investor conversations escalated from KAIVRA AI Assist, updating live.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search investor or reference"
              className="w-56 pl-8"
              aria-label="Search support requests"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Unresolved</SelectItem>
              <SelectItem value="all">All requests</SelectItem>
              {SUPPORT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SUPPORT_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {tickets.isLoading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : tickets.isError ? (
        <EmptyState
          title="Support requests could not be loaded"
          body="Please check your connection and try again."
          action={<Button onClick={() => void tickets.refetch()}>Retry</Button>}
        />
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[22rem_1fr]">
          {/* Conversation list */}
          <div className={cn("space-y-2", selected ? "hidden lg:block" : "block")}>
            {rows.length === 0 ? (
              <EmptyState
                title="No support requests"
                body="Requests raised through KAIVRA AI Assist appear here."
              />
            ) : (
              rows.map((t) => {
                const investor = investorOf(t.investor_id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40",
                      selectedId === t.id && "border-primary/60 bg-primary/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{t.subject}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground",
                          PRIORITY_TONE[t.priority] ?? "border-border",
                        )}
                      >
                        {t.priority}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {investor?.full_name ?? "Investor"}
                      {investor?.investor_code ? ` · ${investor.investor_code}` : ""}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {SUPPORT_STATUS_LABEL[t.status as SupportStatus] ?? t.status} ·{" "}
                      {formatDate(t.last_message_at ?? t.created_at)}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {/* Conversation workspace */}
          <div className={cn(selected ? "block" : "hidden lg:block")}>
            {!selected ? (
              <div className="flex h-full min-h-[20rem] items-center justify-center rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                Select a conversation to reply.
              </div>
            ) : (
              <div className="flex h-[calc(100vh-14rem)] min-h-[28rem] flex-col rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        onClick={() => setSelectedId(null)}
                        aria-label="Back to list"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <p className="truncate font-semibold">{selected.subject}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {investorOf(selected.investor_id)?.full_name ?? "Investor"} ·{" "}
                      {investorOf(selected.investor_id)?.email ?? "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {selected.category} · {formatDate(selected.created_at)}
                      {selected.projects?.name ? ` · ${selected.projects.name}` : ""}
                      {selected.applications?.reference
                        ? ` · ${selected.applications.reference}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <ReferenceChip value={selected.reference} size="sm" />
                    {settings.whatsapp_enabled && investorOf(selected.investor_id)?.phone ? (
                      <a
                        href={buildWhatsAppLink(
                          investorOf(selected.investor_id)?.phone ?? settings.whatsapp_number,
                          {
                            reference: selected.reference,
                            topic: selected.subject,
                          },
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp investor
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 py-3">
                  <Select
                    value={selected.status}
                    onValueChange={(s) => void setStatus(selected.id, s as SupportStatus)}
                  >
                    <SelectTrigger className="h-9 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SUPPORT_STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {isAdmin ? (
                    <Select
                      value={selected.assigned_to ?? "unassigned"}
                      onValueChange={async (value) => {
                        try {
                          await updateSupportTicket({
                            data: {
                              ticketId: selected.id,
                              assignedTo: value === "unassigned" ? null : value,
                              ...(selected.status === "open"
                                ? { status: "assigned" as const }
                                : {}),
                            },
                          });
                          toast.success("Assignment updated");
                          void queryClient.invalidateQueries({
                            queryKey: ["admin-support-tickets"],
                          });
                        } catch {
                          toast.error("The assignment could not be saved.");
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 w-56">
                        <SelectValue placeholder="Assign to…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {(staff.data ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.full_name ?? s.email ?? s.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>

                {isAdmin && selected.channel === "complaint" ? (
                  <div className="mb-3 space-y-2 rounded-md border border-border bg-muted/30 p-3">
                    <p className="eyebrow text-muted-foreground">Complaint resolution</p>
                    <Textarea
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      rows={2}
                      placeholder="Resolution shared with the investor…"
                    />
                    <div className="flex flex-wrap gap-2">
                      <AsyncButton
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await acknowledgeComplaint({ data: { ticketId: selected.id } });
                          toast.success("Complaint acknowledged.");
                          void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
                        }}
                      >
                        Acknowledge
                      </AsyncButton>
                      <AsyncButton
                        size="sm"
                        onClick={async () => {
                          if (resolution.trim().length < 5) {
                            toast.error("Add a resolution note first.");
                            return;
                          }
                          await resolveComplaint({
                            data: { ticketId: selected.id, resolution: resolution.trim() },
                          });
                          setResolution("");
                          toast.success("Complaint resolved.");
                          void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
                        }}
                      >
                        Resolve complaint
                      </AsyncButton>
                      <EffectCorrectionDialog
                        investorId={selected.investor_id}
                        investorName={investorOf(selected.investor_id)?.full_name ?? null}
                        ticketId={selected.id}
                        defaultApplicationId={selected.application_id ?? null}
                      />
                    </div>
                  </div>
                ) : null}

                <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                  {selected.message}
                </p>

                <SupportThread
                  key={selected.id}
                  ticketId={selected.id}
                  viewerId={user?.id ?? null}
                  allowInternal
                  placeholder="Reply to the investor…"
                  className="mt-3"
                  emptyLabel="No replies yet — start the conversation."
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
