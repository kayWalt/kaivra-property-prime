import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { StatusBadge } from "@/components/kaivra/StatusBadge";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { useSession } from "@/hooks/useAuth";
import { APPLICATION_SELECT, totals } from "@/lib/applications";
import { formatDate, formatNaira, type ApplicationStatus } from "@/lib/kaivra";

export const Route = createFileRoute("/_authenticated/applications/")({
  head: () => ({
    meta: [
      { title: "KAIVRA | My Applications" },
      {
        name: "description",
        content: "Track every investment application you have started or submitted.",
      },
      { property: "og:title", content: "KAIVRA | My Applications" },
      { property: "og:description", content: "Track your investment applications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyApplications,
});

function localDraftKey(id: string) {
  return `kaivra:application:${id}`;
}

function MyApplications() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [discardTarget, setDiscardTarget] = useState<{ id: string; name: string } | null>(null);
  const [discarding, setDiscarding] = useState(false);

  const apps = useQuery({
    queryKey: ["my-applications", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(`${APPLICATION_SELECT}, application_payments(amount, status)`)
        .eq("investor_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function discardDraft() {
    if (!discardTarget || !user) return;
    setDiscarding(true);
    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("id", discardTarget.id)
      .eq("investor_id", user.id)
      .eq("status", "draft");
    setDiscarding(false);

    if (error) {
      toast.error("That draft could not be discarded. Please try again.");
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(localDraftKey(discardTarget.id));
    }
    toast.success("Draft discarded.");
    setDiscardTarget(null);
    void queryClient.invalidateQueries({ queryKey: ["my-applications"] });
    void queryClient.invalidateQueries({ queryKey: ["application", discardTarget.id] });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl">My applications</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Every application you have started, submitted or completed.
      </p>

      <div className="mt-8 space-y-3">
        {apps.isLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          : null}
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
          const { paid } = totals(
            app.application_payments ?? [],
            Number(investment.total_value ?? 0),
          );
          const isDraft = app.status === "draft";

          if (isDraft) {
            return (
              <div
                key={app.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4"
              >
                <Link
                  to="/application"
                  search={{ id: app.id }}
                  className="min-w-0 flex-1 rounded-md transition-colors hover:text-primary"
                >
                  <p className="eyebrow text-muted-foreground">{app.reference ?? "Draft"}</p>
                  <p className="mt-1 font-display text-xl leading-tight">
                    {app.projects?.name ?? "Project pending"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {app.properties?.name ?? "Property not selected"} · created{" "}
                    {formatDate(app.created_at)}
                  </p>
                </Link>
                <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {formatNaira(investment.total_value ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Paid {formatNaira(paid)}</p>
                  </div>
                  <StatusBadge status={app.status as ApplicationStatus} />
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm">
                      <Link to="/application" search={{ id: app.id }}>
                        Continue
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDiscardTarget({
                          id: app.id,
                          name: app.projects?.name ?? "this application",
                        })
                      }
                    >
                      <Trash2 className="mr-1.5 size-4" />
                      Discard
                    </Button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={app.id}
              to="/applications/$appId"
              params={{ appId: app.id }}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40"
            >
              <div>
                <p className="eyebrow text-muted-foreground">{app.reference ?? "Draft"}</p>
                <p className="mt-1 font-display text-xl leading-tight">
                  {app.projects?.name ?? "Project pending"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {app.properties?.name ?? "Property not selected"} · created{" "}
                  {formatDate(app.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {formatNaira(investment.total_value ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Paid {formatNaira(paid)}</p>
                </div>
                <StatusBadge status={app.status as ApplicationStatus} />
              </div>
            </Link>
          );
        })}
      </div>

      <AlertDialog
        open={!!discardTarget}
        onOpenChange={(open) => {
          if (!open && !discarding) setDiscardTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes your unfinished application
              {discardTarget ? ` for ${discardTarget.name}` : ""}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={discarding}>Keep draft</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={discarding}
              onClick={(event) => {
                event.preventDefault();
                void discardDraft();
              }}
            >
              {discarding ? "Discarding…" : "Discard draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
