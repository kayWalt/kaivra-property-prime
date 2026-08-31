import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { InspectionBadge } from "@/components/kaivra/StatusBadge";
import { useProfile, useSession } from "@/hooks/useAuth";
import { logEvent, notifyStaffForProject } from "@/lib/applications";
import { formatDate } from "@/lib/kaivra";
import {
  INSPECTION_SELECT,
  canInvestorChange,
  formatSlot,
  isUpcoming,
  type InspectionStatus,
} from "@/lib/inspections";

export const Route = createFileRoute("/_authenticated/inspections/")({
  head: () => ({
    meta: [
      { title: "KAIVRA | My Inspections" },
      { name: "description", content: "Track your upcoming and past KAIVRA property inspections." },
      { property: "og:title", content: "KAIVRA | My Inspections" },
      { property: "og:description", content: "Upcoming and past property inspections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InspectionsPage,
});

export type InspectionRow = {
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
  project_id: string | null;
  application_id: string | null;
  investor_id: string;
  projects: { name: string; location: string } | null;
  properties: { name: string; property_type: string; size_label: string } | null;
  applications: { reference: string | null } | null;
};

export function useMyInspections(userId?: string) {
  return useQuery({
    queryKey: ["my-inspections", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspection_appointments")
        .select(INSPECTION_SELECT)
        .eq("investor_id", userId!)
        .order("scheduled_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as InspectionRow[];
    },
  });
}

function InspectionsPage() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const inspections = useMyInspections(user?.id);

  const upcoming = (inspections.data ?? []).filter((i) =>
    isUpcoming(i.status, i.scheduled_date, i.scheduled_time),
  );
  const history = (inspections.data ?? []).filter(
    (i) => !isUpcoming(i.status, i.scheduled_date, i.scheduled_time),
  );

  async function cancel(row: InspectionRow) {
    const { error } = await supabase
      .from("inspection_appointments")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      toast.error("The inspection could not be cancelled. Please try again.");
      return;
    }
    await Promise.all([
      notifyStaffForProject(
        row.project_id,
        "Inspection cancelled",
        `${profile?.full_name ?? user?.email} cancelled inspection ${row.reference}.`,
        "/admin/inspections",
      ),
      row.application_id
        ? logEvent(
            row.application_id,
            "inspection_cancelled",
            row.reference ?? undefined,
            profile?.full_name ?? undefined,
          )
        : Promise.resolve(),
    ]);
    queryClient.invalidateQueries({ queryKey: ["my-inspections"] });
    toast.success("Inspection cancelled.");
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">Site visits</p>
          <h1 className="mt-2 font-display text-4xl">My inspections</h1>
        </div>
        <Button asChild>
          <Link to="/inspections/new">
            <CalendarDays className="mr-2 size-4" /> Schedule inspection
          </Link>
        </Button>
      </div>

      {inspections.isLoading ? (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-36 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-lg" />
        </div>
      ) : null}

      {inspections.isError ? (
        <p className="mt-8 text-sm text-destructive">
          Your inspections could not be loaded. Please refresh.
        </p>
      ) : null}

      {inspections.data && inspections.data.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No inspection scheduled"
            body="Book a guided site visit for any of your investments."
            action={
              <Button asChild>
                <Link to="/inspections/new">Schedule inspection</Link>
              </Button>
            }
          />
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Upcoming</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {upcoming.map((row) => (
              <article
                key={row.id}
                className="rounded-lg border border-border bg-card p-5 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl leading-tight">
                      {row.projects?.name ?? "Project"}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {row.properties?.name ?? "Property"}
                    </p>
                  </div>
                  <InspectionBadge status={row.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="eyebrow text-muted-foreground">Date</dt>
                    <dd className="mt-1 font-semibold">{formatDate(row.scheduled_date)}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow text-muted-foreground">Time</dt>
                    <dd className="mt-1 font-semibold">{formatSlot(row.scheduled_time)}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow text-muted-foreground">Reference</dt>
                    <dd className="mt-1 font-semibold">{row.reference}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow text-muted-foreground">Visitors</dt>
                    <dd className="mt-1 font-semibold">{row.attendee_count}</dd>
                  </div>
                </dl>
                {row.projects?.location ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" /> {row.projects.location}
                  </p>
                ) : null}
                {row.admin_note ? (
                  <p className="mt-3 rounded-md border border-border bg-muted/60 p-3 text-xs">
                    {row.admin_note}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  {canInvestorChange(row.status, row.scheduled_date, row.scheduled_time) ? (
                    <>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/inspections/new">Reschedule</Link>
                      </Button>
                      <AsyncButton
                        variant="ghost"
                        size="sm"
                        onClick={() => cancel(row)}
                        pendingLabel="Cancelling…"
                      >
                        Cancel
                      </AsyncButton>
                    </>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3.5" /> Changes close 24 hours before the visit.
                      Contact your adviser.
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {history.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-2xl">Inspection history</h2>
          <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
            {history.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold">{row.projects?.name ?? "Project"}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.reference} · {formatDate(row.scheduled_date)} ·{" "}
                    {formatSlot(row.scheduled_time)}
                  </p>
                </div>
                <InspectionBadge status={row.status} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
