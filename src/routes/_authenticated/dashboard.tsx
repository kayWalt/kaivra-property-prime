import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ADMIN_MODULES, buildAdminAccess, useMyProxyGrant } from "@/lib/proxy-admin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, CreditCard, FileText, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InspectionBadge, PaymentBadge, StatusBadge } from "@/components/kaivra/StatusBadge";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { ReferenceChip } from "@/components/kaivra/ReferenceChip";
import { ShareInvestorId } from "@/components/kaivra/ShareInvestorId";
import { useProfile, useRoles, useSession, primaryRole } from "@/hooks/useAuth";
import { APPLICATION_SELECT, totals } from "@/lib/applications";
import { formatDate, formatNaira, type ApplicationStatus } from "@/lib/kaivra";
import { useMyInspections } from "./inspections.index";
import { useMyTransactions } from "./transactions";
import { formatSlot, isUpcoming } from "@/lib/inspections";
import { mediaSrc } from "@/lib/media";
import { MyRequestsPanel } from "@/components/kaivra/MyRequestsPanel";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Investor Dashboard" },
      {
        name: "description",
        content: "View your real-estate investments, payments and application status.",
      },
      { property: "og:title", content: "KAIVRA | Investor Dashboard" },
      { property: "og:description", content: "Your investments at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const QUICK_ACTIONS = [
  { to: "/application", label: "Complete application", icon: FileText },
  { to: "/applications", label: "My investments", icon: Layers },
  { to: "/transactions", label: "Payment history", icon: CreditCard },
  { to: "/inspections", label: "Inspections", icon: CalendarDays },
] as const;

function Dashboard() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const { data: roles } = useRoles(user?.id);
  const role = primaryRole(roles);
  const navigate = useNavigate();
  const { data: grant, isLoading: grantLoading } = useMyProxyGrant(
    role === "admin" ? user?.id : undefined,
  );
  const access = buildAdminAccess(role, grant ?? null);

  // Administrators land in their own workspace; a Proxy Admin is sent to the
  // first module their grant actually allows. Expired grants stay here.
  useEffect(() => {
    if (role !== "admin" && role !== "super_admin") return;
    if (role === "admin" && grantLoading) return;
    if (access.accessExpired) return;
    const target = access.can("applications", "view")
      ? "/admin"
      : (ADMIN_MODULES.find((m) => access.modules.includes(m.key))?.to ?? null);
    if (target) void navigate({ to: target, replace: true });
  }, [role, grantLoading, access.accessExpired, access.modules.join(","), navigate]);


  const apps = useQuery({
    queryKey: ["my-applications", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(`${APPLICATION_SELECT}, application_payments(amount, status)`)
        .eq("investor_id", user!.id)
        .order("created_at", { ascending: false })
        // The dashboard only renders recent activity — don't pull a full history
        // over a mobile connection.
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Portfolio figures are derived from every non-draft application the investor
  // owns (not just the 50 most recent shown below), so the numbers stay correct
  // as investments and payments are added.
  const portfolioQuery = useQuery({
    queryKey: ["portfolio-totals", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(
          "id, status, project_id, property_id, investment, application_payments(amount, status)",
        )
        .eq("investor_id", user!.id)
        .neq("status", "draft");
      if (error) throw error;
      return data ?? [];
    },
  });

  const inspections = useMyInspections(user?.id);
  const recentTx = useMyTransactions(user?.id, 5);

  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user?.id) return;
    const recalculate = () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-totals", user.id] });
      queryClient.invalidateQueries({ queryKey: ["my-applications", user.id] });
      queryClient.invalidateQueries({ queryKey: ["my-transactions", user.id] });
    };
    const channel = supabase
      .channel(`portfolio-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "application_payments" },
        recalculate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "applications",
          filter: `investor_id=eq.${user.id}`,
        },
        recalculate,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  const portfolioRows = portfolioQuery.data ?? [];
  const portfolio = portfolioRows.reduce(
    (acc, app) => {
      const investment = (app.investment ?? {}) as { total_value?: number };
      const totalValue = Number(investment.total_value ?? 0);
      const payments = app.application_payments ?? [];
      const verified = payments
        .filter((p) => p.status === "verified")
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
      const pending = payments
        .filter((p) => p.status === "pending")
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
      acc.value += totalValue;
      acc.paid += verified;
      acc.pending += pending;
      acc.outstanding += Math.max(0, totalValue - verified);
      acc.count += 1;
      return acc;
    },
    { value: 0, paid: 0, pending: 0, outstanding: 0, count: 0 },
  );
  const progress = portfolio.value > 0 ? Math.round((portfolio.paid / portfolio.value) * 100) : 0;
  const projectCount = new Set(portfolioRows.map((a) => a.project_id).filter(Boolean) as string[])
    .size;
  const propertyCount = new Set(portfolioRows.map((a) => a.property_id).filter(Boolean) as string[])
    .size;

  const nextInspection = (inspections.data ?? [])
    .filter((i) => isUpcoming(i.status, i.scheduled_date, i.scheduled_time))
    .sort((a, b) =>
      a.scheduled_date + a.scheduled_time > b.scheduled_date + b.scheduled_time ? 1 : -1,
    )[0];

  const firstName = (profile?.full_name || user?.email || "Investor").split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <p className="eyebrow text-primary">
        {role === "investor" ? "Investor" : role.replace("_", " ")}
      </p>
      <h1 className="mt-2 font-display text-4xl">Welcome back, {firstName}</h1>
      <ReferenceChip
        className="mt-3 max-w-xs"
        label="KAIVRA Investor ID"
        value={profile?.investor_code}
      />

      {role === "investor" && profile?.investor_code ? (
        <section className="mt-4 rounded-lg border border-border bg-card/60 p-4">
          <h2 className="text-sm font-semibold">Need help completing your application?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Give your KAIVRA Investor ID to your authorised Investment Adviser or Administrator.
            They can securely continue your application without needing your password.
          </p>
          <div className="mt-3">
            <ShareInvestorId code={profile.investor_code} />
          </div>
        </section>
      ) : null}

      {role !== "investor" ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            You have management access. Open the management workspace to review applications and
            verify payments.
          </p>
          <Button asChild className="mt-4">
            <Link to="/admin">Open management workspace</Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.label}
            to={action.to}
            className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <action.icon className="size-5 text-primary" aria-hidden />
            <p className="mt-6 text-sm font-semibold leading-tight">{action.label}</p>
          </Link>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="font-display text-3xl">Portfolio overview</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Total invested", formatNaira(portfolio.value)],
            ["Total paid (verified)", formatNaira(portfolio.paid)],
            ["Outstanding balance", formatNaira(portfolio.outstanding)],
            ["Awaiting verification", formatNaira(portfolio.pending)],
            ["Investments", String(portfolio.count)],
            ["Projects", String(projectCount)],
            ["Properties", String(propertyCount)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-card p-4">
              <p className="eyebrow text-muted-foreground">{label}</p>
              <p className="mt-2 font-display text-2xl">{portfolioQuery.isLoading ? "—" : value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm">
            <p className="eyebrow text-muted-foreground">Payment progress</p>
            <p className="font-semibold">{progress}%</p>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-2xl">Upcoming inspection</h2>
          {inspections.isLoading ? (
            <Skeleton className="mt-4 h-24 w-full rounded-lg" />
          ) : nextInspection ? (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="eyebrow text-muted-foreground">Project</dt>
                  <dd className="mt-1 font-semibold">{nextInspection.projects?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Property</dt>
                  <dd className="mt-1 font-semibold">{nextInspection.properties?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Date</dt>
                  <dd className="mt-1 font-semibold">
                    {formatDate(nextInspection.scheduled_date)}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">Time</dt>
                  <dd className="mt-1 font-semibold">
                    {formatSlot(nextInspection.scheduled_time)}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex items-center gap-3">
                <InspectionBadge status={nextInspection.status} />
                <Button asChild size="sm" variant="outline">
                  <Link to="/inspections">View inspection</Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">No inspection scheduled</p>
              <Button asChild className="mt-4" size="sm">
                <Link to="/inspections/new">Schedule inspection</Link>
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl">Recent transactions</h2>
            <Button asChild size="sm" variant="ghost">
              <Link to="/transactions">View all</Link>
            </Button>
          </div>
          {recentTx.isLoading ? (
            <Skeleton className="mt-4 h-24 w-full rounded-lg" />
          ) : (recentTx.data?.length ?? 0) === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {recentTx.data?.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold">{formatNaira(t.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(t.paid_on ?? t.created_at)} ·{" "}
                      {t.applications?.projects?.name ?? "—"}
                    </p>
                  </div>
                  <PaymentBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="mt-12 flex items-end justify-between">
        <h2 className="font-display text-3xl">My investments</h2>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">Explore projects</Link>
        </Button>
      </div>

      <div className="mt-6 space-y-4">
        {apps.isLoading
          ? [0, 1].map((i) => <Skeleton key={i} className="h-44 w-full rounded-lg" />)
          : null}

        {apps.isError ? (
          <p className="text-sm text-destructive">
            Your investments could not be loaded. Please refresh the page.
          </p>
        ) : null}

        {apps.data?.length === 0 ? (
          <EmptyState
            title="You don't have any investments yet."
            body="Browse our featured projects and start your first investment application."
            action={
              <Button asChild>
                <Link to="/">Explore projects</Link>
              </Button>
            }
          />
        ) : null}

        {apps.data?.map((app) => {
          const investment = (app.investment ?? {}) as { total_value?: number };
          const totalValue = Number(investment.total_value ?? 0);
          const { paid, outstanding } = totals(app.application_payments ?? [], totalValue);
          return (
            <article
              key={app.id}
              className="grid gap-0 overflow-hidden rounded-lg border border-border bg-card shadow-card sm:grid-cols-[14rem_1fr]"
            >
              <img
                src={mediaSrc(app.projects?.hero_image)}
                alt={app.projects?.name ?? "Project"}
                loading="lazy"
                width={1280}
                height={960}
                className="h-40 w-full object-cover sm:h-full"
              />
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-2xl leading-tight">
                      {app.projects?.name ?? "Project pending"}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {app.properties?.name ?? "Property not selected"}
                      {app.properties?.size_label ? ` · ${app.properties.size_label}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={app.status as ApplicationStatus} />
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="eyebrow text-muted-foreground">Investment</dt>
                    <dd className="mt-1 text-sm font-semibold">{formatNaira(totalValue)}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow text-muted-foreground">Paid</dt>
                    <dd className="mt-1 text-sm font-semibold text-primary">{formatNaira(paid)}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow text-muted-foreground">Outstanding</dt>
                    <dd className="mt-1 text-sm font-semibold">{formatNaira(outstanding)}</dd>
                  </div>
                </dl>

                <div className="mt-6 flex flex-wrap gap-2">
                  {app.status === "draft" || app.status === "requires_correction" ? (
                    <Button asChild>
                      <Link to="/application" search={{ id: app.id }}>
                        Continue application <ArrowRight className="ml-2 size-4" />
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link to="/applications/$appId" params={{ appId: app.id }}>
                        View investment
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="outline">
                    <Link to="/applications/$appId" params={{ appId: app.id }} hash="payments">
                      Submit payment
                    </Link>
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <MyRequestsPanel userId={user?.id} />
    </div>
  );
}
