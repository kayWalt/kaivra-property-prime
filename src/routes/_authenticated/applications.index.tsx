import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/kaivra/StatusBadge";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { useSession } from "@/hooks/useAuth";
import { APPLICATION_SELECT, totals } from "@/lib/applications";
import { formatDate, formatNaira, type ApplicationStatus } from "@/lib/kaivra";

export const Route = createFileRoute("/_authenticated/applications/")({
  head: () => ({
    meta: [
      { title: "KAIVRA | My Applications" },
      { name: "description", content: "Track every investment application you have started or submitted." },
      { property: "og:title", content: "KAIVRA | My Applications" },
      { property: "og:description", content: "Track your investment applications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyApplications,
});

function MyApplications() {
  const { user } = useSession();
  const apps = useQuery({
    queryKey: ["my-applications", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(`${APPLICATION_SELECT}, application_payments(amount, status)`)
        .eq("investor_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl">My applications</h1>
      <p className="mt-2 text-sm text-muted-foreground">Every application you have started, submitted or completed.</p>

      <div className="mt-8 space-y-3">
        {apps.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />) : null}
        {apps.data?.length === 0 ? (
          <EmptyState
            title="No applications yet."
            body="Start an application to secure your place in one of our projects."
            action={
              <Button asChild>
                <Link to="/application">Start application</Link>
              </Button>
            }
          />
        ) : null}
        {apps.data?.map((app) => {
          const investment = (app.investment ?? {}) as { total_value?: number };
          const { paid } = totals(app.application_payments ?? [], Number(investment.total_value ?? 0));
          return (
            <Link
              key={app.id}
              to="/applications/$appId"
              params={{ appId: app.id }}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40"
            >
              <div>
                <p className="eyebrow text-muted-foreground">{app.reference ?? "Draft"}</p>
                <p className="mt-1 font-display text-xl leading-tight">{app.projects?.name ?? "Project pending"}</p>
                <p className="text-xs text-muted-foreground">
                  {app.properties?.name ?? "Property not selected"} · created {formatDate(app.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatNaira(investment.total_value ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">Paid {formatNaira(paid)}</p>
                </div>
                <StatusBadge status={app.status as ApplicationStatus} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
