import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { ReferenceChip } from "@/components/kaivra/ReferenceChip";
import { useRoles, useSession, primaryRole } from "@/hooks/useAuth";
import { formatDate } from "@/lib/kaivra";
import {
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABEL,
  replyToSupportTicket,
  updateSupportTicket,
  type SupportStatus,
} from "@/lib/support.functions";

export const Route = createFileRoute("/_authenticated/admin/support")({
  head: () => ({
    meta: [
      { title: "KAIVRA | AI & Support Centre" },
      {
        name: "description",
        content: "Handle investor support requests and human handoffs from KAIVRA AI Assist.",
      },
      { property: "og:title", content: "KAIVRA | AI & Support Centre" },
      { property: "og:description", content: "Investor support requests and escalations." },
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
  created_at: string;
  investor_id: string;
  assigned_to: string | null;
  applications: { reference: string | null } | null;
  projects: { name: string } | null;
};

function AdminSupport() {
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const role = primaryRole(roles);
  const isAdmin = role === "admin" || role === "super_admin";
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const tickets = useQuery({
    queryKey: ["admin-support-tickets"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(
          "id, reference, subject, category, message, priority, status, created_at, investor_id, assigned_to, applications(reference), projects(name)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Ticket[];
    },
  });

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
        .select("id, full_name, email, investor_code")
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

  const rows = useMemo(() => {
    const list = tickets.data ?? [];
    if (filter === "all") return list;
    if (filter === "open")
      return list.filter((t) => !["resolved", "closed"].includes(t.status));
    return list.filter((t) => t.status === filter);
  }, [tickets.data, filter]);

  const investorOf = (id: string) => investors.data?.find((p) => p.id === id);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">AI &amp; Support</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Support centre</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Investor requests escalated from KAIVRA AI Assist.
          </p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All requests</SelectItem>
            <SelectItem value="open">Unresolved</SelectItem>
            {SUPPORT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {SUPPORT_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tickets.isLoading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : tickets.isError ? (
        <EmptyState
          title="Support requests could not be loaded"
          description="Please check your connection and try again."
          action={<Button onClick={() => void tickets.refetch()}>Retry</Button>}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No support requests"
          description="Requests raised through KAIVRA AI Assist appear here."
        />
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((t) => {
            const investor = investorOf(t.investor_id);
            return (
              <article key={t.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{t.subject}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {investor?.full_name ?? "Investor"} · {investor?.email ?? "—"}
                      {investor?.investor_code ? ` · ${investor.investor_code}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.category} · {t.priority} priority · {formatDate(t.created_at)}
                      {t.projects?.name ? ` · ${t.projects.name}` : ""}
                      {t.applications?.reference ? ` · ${t.applications.reference}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <ReferenceChip value={t.reference} size="sm" />
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {SUPPORT_STATUS_LABEL[t.status as SupportStatus] ?? t.status}
                    </span>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{t.message}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Select
                    value={t.status}
                    onValueChange={async (status) => {
                      try {
                        await updateSupportTicket({
                          data: { ticketId: t.id, status: status as SupportStatus },
                        });
                        toast.success("Status updated");
                        void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
                      } catch {
                        toast.error("The status could not be updated.");
                      }
                    }}
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
                      value={t.assigned_to ?? "unassigned"}
                      onValueChange={async (value) => {
                        try {
                          await updateSupportTicket({
                            data: {
                              ticketId: t.id,
                              assignedTo: value === "unassigned" ? null : value,
                              ...(t.status === "open" ? { status: "assigned" as const } : {}),
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

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenId(openId === t.id ? null : t.id)}
                  >
                    {openId === t.id ? "Hide conversation" : "Reply / notes"}
                  </Button>
                </div>

                {openId === t.id ? <TicketThread ticketId={t.id} /> : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TicketThread({ ticketId }: { ticketId: string }) {
  const queryClient = useQueryClient();
  const reply = useServerFn(replyToSupportTicket);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);

  const messages = useQuery({
    queryKey: ["support-messages", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, body, is_internal, created_at, author_id")
        .eq("ticket_id", ticketId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-3">
      {messages.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        (messages.data ?? []).map((m) => (
          <div
            key={m.id}
            className={`rounded-md border p-2 text-sm ${
              m.is_internal ? "border-dashed border-border bg-muted/40" : "border-border bg-card"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {m.is_internal ? "Internal note" : "Reply"} · {formatDate(m.created_at)}
            </p>
          </div>
        ))
      )}

      <div className="space-y-2">
        <Label htmlFor={`reply-${ticketId}`}>Message</Label>
        <Textarea
          id={`reply-${ticketId}`}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Reply to the investor, or add an internal note"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={internal}
              onCheckedChange={(v) => setInternal(v === true)}
              aria-label="Internal note"
            />
            Internal note (investor cannot see this)
          </label>
          <AsyncButton
            size="sm"
            disabled={body.trim().length === 0}
            onClick={async () => {
              try {
                await reply({ data: { ticketId, body: body.trim(), internal } });
                setBody("");
                toast.success(internal ? "Note saved" : "Reply sent");
                void queryClient.invalidateQueries({ queryKey: ["support-messages", ticketId] });
              } catch {
                toast.error("Your message could not be sent.");
              }
            }}
          >
            Send
          </AsyncButton>
        </div>
      </div>
    </div>
  );
}

/** Unused input placeholder kept out of the bundle. */
export const _unused = Input;
