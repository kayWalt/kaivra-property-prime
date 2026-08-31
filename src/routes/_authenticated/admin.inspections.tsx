import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { InspectionBadge } from "@/components/kaivra/StatusBadge";
import { useProfile, useRoles, useSession, primaryRole, isStaffRole } from "@/hooks/useAuth";
import { logEvent, notify } from "@/lib/applications";
import { formatDate } from "@/lib/kaivra";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  INSPECTION_SELECT,
  INSPECTION_SLOTS,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_LABEL,
  formatSlot,
  toDateKey,
  type InspectionStatus,
} from "@/lib/inspections";

export const Route = createFileRoute("/_authenticated/admin/inspections")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Inspection Management" },
      { name: "description", content: "Confirm, reschedule and complete investor property inspections." },
      { property: "og:title", content: "KAIVRA | Inspection Management" },
      { property: "og:description", content: "Manage every KAIVRA inspection request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminInspections,
});

type Row = {
  id: string;
  reference: string | null;
  status: InspectionStatus;
  scheduled_date: string;
  scheduled_time: string;
  attendee_count: number;
  phone: string | null;
  email: string | null;
  notes: string | null;
  admin_note: string | null;
  assigned_adviser: string | null;
  investor_id: string;
  application_id: string | null;
  project_id: string | null;
  projects: { name: string; location: string } | null;
  properties: { name: string; property_type: string; size_label: string } | null;
  applications: { reference: string | null } | null;
};

function AdminInspections() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const role = primaryRole(roles);
  const staff = isStaffRole(role);
  const isAdmin = role === "admin" || role === "super_admin";
  const queryClient = useQueryClient();

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [project, setProject] = useState<string>("all");
  const [day, setDay] = useState<string>("");
  const [open, setOpen] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [adviser, setAdviser] = useState<string>("");

  const list = useQuery({
    queryKey: ["admin-inspections", status, project, day],
    enabled: staff,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("inspection_appointments")
        .select(INSPECTION_SELECT)
        .order("scheduled_date", { ascending: true })
        .limit(200);
      if (status !== "all") q = q.eq("status", status as InspectionStatus);
      if (project !== "all") q = q.eq("project_id", project);
      if (day) q = q.eq("scheduled_date", day);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const projects = useQuery({
    queryKey: ["admin-inspection-projects"],
    enabled: staff,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const advisers = useQuery({
    queryKey: ["admin-inspection-advisers"],
    enabled: isAdmin,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id").eq("role", "adviser");
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as { id: string; full_name: string | null; email: string | null }[];
      const { data: p, error: pe } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      if (pe) throw pe;
      return p ?? [];
    },
  });

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const data = list.data ?? [];
    if (!needle) return data;
    return data.filter((r) =>
      `${r.reference ?? ""} ${r.projects?.name ?? ""} ${r.properties?.name ?? ""} ${r.email ?? ""} ${r.phone ?? ""} ${r.applications?.reference ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [list.data, term]);

  const todayKey = toDateKey(new Date());
  const counts = useMemo(() => {
    const data = list.data ?? [];
    return {
      today: data.filter((r) => r.scheduled_date === todayKey).length,
      pending: data.filter((r) => r.status === "requested").length,
      confirmed: data.filter((r) => r.status === "confirmed").length,
      upcoming: data.filter((r) => r.scheduled_date >= todayKey && r.status !== "cancelled").length,
    };
  }, [list.data, todayKey]);

  function openRow(row: Row) {
    setOpen(row);
    setNote(row.admin_note ?? "");
    setNewDate(row.scheduled_date);
    setNewTime(String(row.scheduled_time).slice(0, 5));
    setAdviser(row.assigned_adviser ?? "");
  }

  async function apply(row: Row, patch: TablesUpdate<"inspection_appointments">, message: string, action: string) {
    const { error } = await supabase.from("inspection_appointments").update(patch).eq("id", row.id);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "That slot is already booked for this project."
          : "The inspection could not be updated. Please try again.",
      );
      return;
    }
    await Promise.all([
      notify(row.investor_id, "Inspection update", message, "/inspections"),
      row.application_id
        ? logEvent(row.application_id, action, `${row.reference} · ${message}`, profile?.full_name ?? undefined)
        : Promise.resolve(),
    ]);
    queryClient.invalidateQueries({ queryKey: ["admin-inspections"] });
    queryClient.invalidateQueries({ queryKey: ["my-inspections"] });
    toast.success("Inspection updated.");
    setOpen(null);
  }

  if (rolesLoading) return <Skeleton className="mx-auto mt-10 h-40 w-full max-w-6xl" />;
  if (!staff) {
    return <EmptyState title="Not available" body="This workspace is for KAIVRA advisers and administrators." />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <p className="eyebrow text-primary">Operations</p>
      <h1 className="mt-2 font-display text-4xl">Inspections</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Today", counts.today],
          ["Pending", counts.pending],
          ["Confirmed", counts.confirmed],
          ["Upcoming", counts.upcoming],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-border bg-card p-4">
            <p className="eyebrow text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search reference, project, contact" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {INSPECTION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {INSPECTION_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger>
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {(projects.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>

      {list.isLoading ? (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="No inspections found" body="Adjust your filters or wait for new investor requests." />
        </div>
      ) : (
        <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => openRow(row)}
              className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-accent/30"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {row.projects?.name ?? "Project"} · {row.properties?.name ?? "Property"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.reference} · {formatDate(row.scheduled_date)} · {formatSlot(row.scheduled_time)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.email ?? "—"} · {row.phone ?? "—"} · {row.attendee_count} visitor(s)
                </p>
              </div>
              <InspectionBadge status={row.status} />
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">Manage inspection</SheetTitle>
          </SheetHeader>
          {open ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
                <p className="font-semibold">{open.projects?.name}</p>
                <p className="text-muted-foreground">{open.properties?.name}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {open.reference} · {open.applications?.reference ?? "—"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {open.email ?? "—"} · {open.phone ?? "—"}
                </p>
                {open.notes ? <p className="mt-2 text-xs">{open.notes}</p> : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="reschedule-date">Date</Label>
                  <Input id="reschedule-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="reschedule-time">Time</Label>
                  <Select value={newTime} onValueChange={setNewTime}>
                    <SelectTrigger id="reschedule-time">
                      <SelectValue placeholder="Time" />
                    </SelectTrigger>
                    <SelectContent>
                      {INSPECTION_SLOTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {formatSlot(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isAdmin ? (
                <div>
                  <Label htmlFor="adviser">Assigned adviser</Label>
                  <Select value={adviser || "none"} onValueChange={(v) => setAdviser(v === "none" ? "" : v)}>
                    <SelectTrigger id="adviser">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {(advisers.data ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.full_name ?? a.email ?? a.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div>
                <Label htmlFor="admin-note">Internal note</Label>
                <Textarea id="admin-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              <div className="flex flex-wrap gap-2">
                <AsyncButton
                  size="sm"
                  onClick={() =>
                    apply(
                      open,
                      {
                        status: "confirmed",
                        confirmed_at: new Date().toISOString(),
                        admin_note: note || null,
                        assigned_adviser: adviser || null,
                      },
                      `Your inspection ${open.reference} is confirmed for ${formatDate(open.scheduled_date)} at ${formatSlot(open.scheduled_time)}.`,
                      "inspection_confirmed",
                    )
                  }
                >
                  Confirm
                </AsyncButton>
                <AsyncButton
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    apply(
                      open,
                      {
                        status: "rescheduled",
                        scheduled_date: newDate,
                        scheduled_time: `${newTime}:00`,
                        admin_note: note || null,
                        assigned_adviser: adviser || null,
                      },
                      `Your inspection ${open.reference} has been moved to ${formatDate(newDate)} at ${formatSlot(newTime)}.`,
                      "inspection_rescheduled",
                    )
                  }
                >
                  Reschedule
                </AsyncButton>
                <AsyncButton
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    apply(
                      open,
                      { status: "completed", completed_at: new Date().toISOString(), admin_note: note || null },
                      `Your inspection ${open.reference} has been marked completed. Thank you for visiting.`,
                      "inspection_completed",
                    )
                  }
                >
                  Mark completed
                </AsyncButton>
                <AsyncButton
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    apply(
                      open,
                      { status: "no_show", admin_note: note || null },
                      `Your inspection ${open.reference} was recorded as a no-show. Contact us to rebook.`,
                      "inspection_no_show",
                    )
                  }
                >
                  No show
                </AsyncButton>
                <AsyncButton
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    apply(
                      open,
                      { status: "cancelled", cancelled_at: new Date().toISOString(), admin_note: note || null },
                      `Your inspection ${open.reference} has been cancelled. Please book a new visit.`,
                      "inspection_cancelled",
                    )
                  }
                >
                  Cancel
                </AsyncButton>
                <AsyncButton
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    apply(
                      open,
                      { admin_note: note || null, assigned_adviser: adviser || null },
                      `Your inspection ${open.reference} has been updated.`,
                      "inspection_updated",
                    )
                  }
                >
                  Save note
                </AsyncButton>
              </div>
              <Button variant="ghost" className="w-full" onClick={() => setOpen(null)}>
                Close
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
