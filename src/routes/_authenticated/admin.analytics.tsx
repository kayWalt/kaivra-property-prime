import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Activity, Download, Eye, ShieldAlert, ShieldOff, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { useRoles, useSession, primaryRole } from "@/hooks/useAuth";
import { buildAdminAccess, canAnalytics, useMyProxyGrant } from "@/lib/proxy-admin";
import { DATE_RANGES, EVENT_CATEGORIES, eventLabel, type DateRangeKey } from "@/lib/analytics";
import {
  activityFeed,
  analyticsOverview,
  exportActivityCsv,
  securitySignals,
  userFootprint,
  visitorDirectory,

} from "@/lib/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Visitor & Activity Analytics" },
      {
        name: "description",
        content:
          "Privacy-conscious visitor and user activity monitoring for KAIVRA Super Administrators.",
      },
      { property: "og:title", content: "KAIVRA | Visitor & Activity Analytics" },
      { property: "og:description", content: "KAIVRA digital footprint monitoring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsGate,
});

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 160 60% 40%))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--accent-foreground))",
  "hsl(var(--destructive))",
  "hsl(var(--ring))",
];

function AnalyticsGate() {
  const { user, loading } = useSession();
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const role = primaryRole(roles);
  const { data: grant, isLoading: grantLoading } = useMyProxyGrant(
    role === "admin" ? user?.id : undefined,
  );
  const access = buildAdminAccess(role, grant ?? null);
  const busy = loading || rolesLoading || (role === "admin" && grantLoading);

  if (busy) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!canAnalytics(access)) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-20 text-center sm:px-6">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <ShieldOff className="size-6 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="font-serif text-2xl">Authorisation required</h1>
        <p className="text-sm text-muted-foreground">
          Visitor analytics is a KAIVRA Super Admin function. Contact a Super Admin if you require
          access.
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return <AnalyticsDashboard canExport={canAnalytics(access, "export")} />;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-serif text-2xl">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function AnalyticsDashboard({ canExport }: { canExport: boolean }) {
  const [rangeKey, setRangeKey] = useState<DateRangeKey>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("all");
  const [result, setResult] = useState("all");
  const [search, setSearch] = useState("");
  const [profileUser, setProfileUser] = useState<string | null>(null);

  const overviewFn = useServerFn(analyticsOverview);
  const feedFn = useServerFn(activityFeed);
  const securityFn = useServerFn(securitySignals);
  const exportFn = useServerFn(exportActivityCsv);

  const range = useMemo(
    () => ({
      rangeKey,
      ...(rangeKey === "custom" && from && to ? { from, to } : {}),
    }),
    [rangeKey, from, to],
  );

  const overview = useQuery({
    queryKey: ["analytics-overview", range],
    queryFn: () => overviewFn({ data: range as never }),
  });

  const feed = useQuery({
    queryKey: ["analytics-feed", range, category, result, search],
    queryFn: () =>
      feedFn({
        data: {
          ...range,
          ...(category !== "all" ? { category } : {}),
          ...(result !== "all" ? { result } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          limit: 100,
          offset: 0,
        } as never,
      }),
  });

  const security = useQuery({
    queryKey: ["analytics-security", range],
    queryFn: () => securityFn({ data: range as never }),
  });

  const totals = overview.data?.totals;

  async function downloadCsv() {
    const res = await exportFn({
      data: {
        ...range,
        ...(category !== "all" ? { category } : {}),
        ...(result !== "all" ? { result } : {}),
        limit: 100,
        offset: 0,
      } as never,
    });
    const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kaivra-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${res.rows} activity records.`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl">Visitor &amp; Activity Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Privacy-conscious digital footprint. No raw IP addresses are stored.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as DateRangeKey)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rangeKey === "custom" ? (
            <>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-40"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-40"
              />
            </>
          ) : null}
          {canExport ? (
            <AsyncButton variant="outline" onClick={downloadCsv}>
              <Download className="mr-2 size-4" aria-hidden />
              Export CSV
            </AsyncButton>
          ) : null}
        </div>
      </header>

      {overview.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Unique visitors" value={String(totals?.visitors ?? 0)} />
            <Stat label="Sessions" value={String(totals?.sessions ?? 0)} />
            <Stat label="Page views" value={String(totals?.pageViews ?? 0)} />
            <Stat label="Signed-in users" value={String(totals?.signedIn ?? 0)} />
            <Stat
              label="Avg. session"
              value={`${Math.round((totals?.avgDurationSeconds ?? 0) / 60)}m`}
              hint={`${totals?.avgDurationSeconds ?? 0}s`}
            />
            <Stat label="Bounce rate" value={`${totals?.bounceRate ?? 0}%`} />
            <Stat label="Returning" value={`${totals?.returningRate ?? 0}%`} />
            <Stat
              label="Security events"
              value={String(totals?.securityEvents ?? 0)}
              hint={`${totals?.failures ?? 0} failures`}
            />
          </section>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Traffic over time</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overview.data?.timeseries ?? []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="day" fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="visitors"
                    stroke={CHART_COLORS[0]}
                    fill={CHART_COLORS[0]}
                    fillOpacity={0.2}
                  />
                  <Area
                    type="monotone"
                    dataKey="events"
                    stroke={CHART_COLORS[1]}
                    fill={CHART_COLORS[1]}
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Most visited pages</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.data?.topPages ?? []} layout="vertical">
                    <XAxis type="number" fontSize={11} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={130} fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="value" fill={CHART_COLORS[0]} radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Devices</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={overview.data?.devices ?? []}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={85}
                    >
                      {(overview.data?.devices ?? []).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <BreakdownCard title="Countries" rows={overview.data?.countries ?? []} />
            <BreakdownCard title="Browsers" rows={overview.data?.browsers ?? []} />
            <BreakdownCard title="Traffic sources" rows={overview.data?.referrers ?? []} />
          </div>
        </>
      )}

      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">
            <Users className="mr-2 size-4" aria-hidden />
            People
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="mr-2 size-4" aria-hidden />
            Recent activity
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldAlert className="mr-2 size-4" aria-hidden />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="space-y-3 pt-4">
          <PeopleTab range={range} onOpenUser={setProfileUser} />
        </TabsContent>


        <TabsContent value="activity" className="space-y-3 pt-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search user, event or page"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {EVENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Result" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {feed.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (feed.data?.items ?? []).length === 0 ? (
            <EmptyState title="No activity" body="No events match these filters yet." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Who</th>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2">Page</th>
                    <th className="px-3 py-2">Context</th>
                  </tr>
                </thead>
                <tbody>
                  {(feed.data?.items ?? []).map((row: any) => (
                    <tr key={row.id} className="border-t">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {new Date(row.occurred_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {row.actor ? (
                          <button
                            className="underline underline-offset-2"
                            onClick={() => setProfileUser(row.actor)}
                          >
                            {row.actor_label ?? "User"}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">
                            {row.actor_label ?? "Visitor"}
                          </span>
                        )}
                        <div className="text-xs text-muted-foreground">{row.actor_role}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{eventLabel(row.event_type)}</span>
                        {row.severity !== "info" ? (
                          <Badge variant="destructive" className="ml-2">
                            {row.severity}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{row.route ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {[row.device_category, row.browser, row.country].filter(Boolean).join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Showing {(feed.data?.items ?? []).length} of {feed.data?.total ?? 0} records.
          </p>
        </TabsContent>

        <TabsContent value="security" className="space-y-4 pt-4">
          {security.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <>
              {(security.data?.repeatedFailures ?? []).length > 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Repeated failures</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {(security.data?.repeatedFailures ?? []).map((r) => (
                      <div key={r.name} className="flex justify-between">
                        <span className="font-mono text-xs">{r.name.slice(0, 12)}…</span>
                        <span>{r.value} failed attempts</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Security &amp; admin events</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {(security.data?.events ?? []).length === 0 ? (
                    <p className="text-muted-foreground">No elevated events in this period.</p>
                  ) : (
                    (security.data?.events ?? []).map((row: any) => (
                      <div key={row.id} className="flex flex-wrap justify-between gap-2 border-b pb-2">
                        <span>
                          {eventLabel(row.event_type)}{" "}
                          <span className="text-muted-foreground">
                            · {row.actor_label ?? "Visitor"} ({row.actor_role})
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(row.occurred_at).toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Proxy Admin &amp; privileged actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {(security.data?.adminEvents ?? []).length === 0 ? (
                    <p className="text-muted-foreground">No privileged actions recorded.</p>
                  ) : (
                    (security.data?.adminEvents ?? []).map((row: any) => (
                      <div key={row.id} className="flex flex-wrap justify-between gap-2 border-b pb-2">
                        <span>
                          {row.action}{" "}
                          <span className="text-muted-foreground">
                            · {row.actor_name ?? "Unknown"} ({row.actor_role ?? "admin"})
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <UserFootprintSheet userId={profileUser} onClose={() => setProfileUser(null)} />
    </div>
  );
}

function PeopleTab({
  range,
  onOpenUser,
}: {
  range: Record<string, unknown>;
  onOpenUser: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [onlySignedIn, setOnlySignedIn] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const directoryFn = useServerFn(visitorDirectory);

  const q = useQuery({
    queryKey: ["analytics-people", range, search, onlySignedIn],
    queryFn: () =>
      directoryFn({
        data: {
          ...range,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(onlySignedIn === "signed-in" ? { onlySignedIn: true } : {}),
        } as never,
      }),
  });

  const people = (q.data?.people ?? []) as any[];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search name, email, phone, investor ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72"
        />
        <Select value={onlySignedIn} onValueChange={setOnlySignedIn}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="signed-in">Signed-in users only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : people.length === 0 ? (
        <EmptyState title="No visitors" body="Nobody visited in this period." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Sessions</th>
                <th className="px-3 py-2">Pages</th>
                <th className="px-3 py-2">Last seen</th>
                <th className="px-3 py-2">Context</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const key = p.userId ?? p.visitorId;
                const open = expanded === key;
                return (
                  <Fragment key={key}>
                    <tr className="border-t align-top">
                      <td className="px-3 py-2">
                        {p.userId ? (
                          <button
                            className="font-medium underline underline-offset-2"
                            onClick={() => onOpenUser(p.userId)}
                          >
                            {p.name ?? p.email ?? "Signed-in user"}
                          </button>
                        ) : (
                          <span className="font-medium">Anonymous visitor</span>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {p.email ?? `ID ${String(p.visitorId).slice(0, 10)}…`}
                        </div>
                        {p.phone || p.investorCode ? (
                          <div className="text-xs text-muted-foreground">
                            {[p.investorCode, p.phone].filter(Boolean).join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={p.userId ? "secondary" : "outline"}>{p.role}</Badge>
                        {p.failedSignIns > 0 ? (
                          <div className="mt-1 text-xs text-destructive">
                            {p.failedSignIns} failed sign-in{p.failedSignIns > 1 ? "s" : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {p.sessions}
                        <div className="text-xs text-muted-foreground">
                          {p.isReturning ? "Returning" : "New"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          className="underline underline-offset-2"
                          onClick={() => setExpanded(open ? null : key)}
                        >
                          {p.pages.length} page{p.pages.length === 1 ? "" : "s"}
                        </button>
                        <div className="text-xs text-muted-foreground">{p.pageViews} views</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {new Date(p.lastSeen).toLocaleString()}
                        {p.lastSignInEvent ? (
                          <div className="text-xs">
                            Signed in {new Date(p.lastSignInEvent).toLocaleString()}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {[p.device, p.browser, p.os, p.country].filter(Boolean).join(" · ")}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-t bg-muted/30">
                        <td colSpan={6} className="px-3 py-3">
                          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                            Pages visited
                          </p>
                          {p.pages.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No page views recorded in this period.
                            </p>
                          ) : (
                            <div className="grid gap-1 sm:grid-cols-2">
                              {p.pages.map((pg: any) => (
                                <div key={pg.route} className="flex justify-between gap-3 text-xs">
                                  <span className="truncate">{pg.route}</span>
                                  <span className="whitespace-nowrap text-muted-foreground">
                                    {pg.views} · {new Date(pg.lastAt).toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Showing {people.length} of {q.data?.total ?? 0} people.
      </p>
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { name: string; value: number }[] }) {
  const total = rows.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No data yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.name} className="space-y-1">
              <div className="flex justify-between">
                <span className="truncate">{r.name}</span>
                <span className="text-muted-foreground">{r.value}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${Math.round((r.value / total) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function UserFootprintSheet({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const footprintFn = useServerFn(userFootprint);
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-user", userId],
    enabled: !!userId,
    queryFn: () => footprintFn({ data: { userId: userId! } }),
  });

  return (
    <Sheet open={!!userId} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="size-4" aria-hidden /> User footprint
          </SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <Skeleton className="mt-6 h-64 w-full" />
        ) : (
          <div className="mt-6 space-y-5 text-sm">
            <div>
              <p className="font-medium">{(data?.profile as any)?.full_name ?? "Unknown user"}</p>
              <p className="text-muted-foreground">{(data?.profile as any)?.email}</p>
              <p className="text-xs text-muted-foreground">
                {[(data?.profile as any)?.investor_code, (data?.profile as any)?.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            <div className="rounded-lg border p-3">
              <p className="mb-2 font-medium">Login details</p>
              {(data as any)?.login ? (
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Login email</dt>
                    <dd>{(data as any).login.email ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Last sign-in</dt>
                    <dd>
                      {(data as any).login.lastSignInAt
                        ? new Date((data as any).login.lastSignInAt).toLocaleString()
                        : "Never"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Account created</dt>
                    <dd>
                      {(data as any).login.createdAt
                        ? new Date((data as any).login.createdAt).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Email confirmed</dt>
                    <dd>
                      {(data as any).login.emailConfirmedAt
                        ? new Date((data as any).login.emailConfirmedAt).toLocaleDateString()
                        : "Not confirmed"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Sign-in methods</dt>
                    <dd>{((data as any).login.providers ?? []).join(", ") || "email"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">No login record available.</p>
              )}
            </div>

            <div>
              <p className="mb-2 font-medium">Pages visited</p>
              {((data as any)?.pages ?? []).length === 0 ? (
                <p className="text-muted-foreground">No page views recorded.</p>
              ) : (
                ((data as any).pages as any[]).slice(0, 40).map((pg) => (
                  <div key={pg.route} className="flex justify-between gap-3 border-b py-1 text-xs">
                    <span className="truncate">{pg.route}</span>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {pg.views} views · {new Date(pg.lastAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div>
              <p className="mb-2 flex items-center gap-2 font-medium">
                <Eye className="size-4" aria-hidden /> Recent sessions
              </p>
              {(data?.sessions ?? []).length === 0 ? (
                <p className="text-muted-foreground">No sessions recorded.</p>
              ) : (
                (data?.sessions ?? []).map((s: any) => (
                  <div key={s.session_id} className="flex justify-between border-b py-1">
                    <span className="text-muted-foreground">
                      {new Date(s.started_at).toLocaleString()}
                    </span>
                    <span className="text-xs">
                      {s.page_views} views · {s.device_category} · {s.browser}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div>
              <p className="mb-2 font-medium">Recent activity</p>
              {(data?.events ?? []).length === 0 ? (
                <p className="text-muted-foreground">No activity recorded.</p>
              ) : (
                (data?.events ?? []).slice(0, 40).map((e: any) => (
                  <div key={e.id} className="flex justify-between border-b py-1">
                    <span>{eventLabel(e.event_type)}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.occurred_at).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
