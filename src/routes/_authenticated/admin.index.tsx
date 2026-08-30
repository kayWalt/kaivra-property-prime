import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/kaivra/StatusBadge";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { useRoles, useSession, primaryRole, isStaffRole } from "@/hooks/useAuth";
import { totals } from "@/lib/applications";
import { APPLICATION_STATUSES, STATUS_LABEL, formatCompact, formatDate, formatNaira, type ApplicationStatus } from "@/lib/kaivra";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Management Workspace" },
      { name: "description", content: "Review investor applications, verify payments and manage projects." },
      { property: "og:title", content: "KAIVRA | Management Workspace" },
      { property: "og:description", content: "Review applications and verify payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminDashboard,
});

const PAGE_SIZE = 20;

function AdminDashboard() {
  const { user } = useSession();
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const role = primaryRole(roles);
  const staff = isStaffRole(role);

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<"" | ApplicationStatus>("");
  const [page, setPage] = useState(0);

  const apps = useQuery({
    queryKey: ["admin-applications", term, status, page],
    enabled: staff,
    queryFn: async () => {
      let query = supabase
        .from("applications")
        .select(
          "id, reference, status, created_at, submitted_at, investment, personal, contact, projects(name), properties(name), application_payments(amount, status)",
          { count: "exact" },
        )
        .neq("status", "draft")
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status) query = query.eq("status", status);
      if (term.trim()) {
        const q = `%${term.trim()}%`;
        query = query.or(`reference.ilike.${q},personal->>full_name.ilike.${q},contact->>email.ilike.${q}`);
      }
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const stats = useQuery({
    queryKey: ["admin-stats"],
    enabled: staff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id, status, investor_id, investment, application_payments(amount, status)")
        .neq("status", "draft");
      if (error) throw error;
      const rows = data ?? [];
      const investors = new Set(rows.map((r) => r.investor_id));
      const value = rows.reduce((sum, r) => sum + Number(((r.investment ?? {}) as { total_value?: number }).total_value ?? 0), 0);
      const pendingPayments = rows.reduce(
        (sum, r) => sum + (r.application_payments ?? []).filter((p) => p.status === "pending").length,
        0,
      );
      return {
        investors: investors.size,
        applications: rows.length,
        pending: rows.filter((r) => r.status === "submitted" || r.status === "under_review").length,
        pendingPayments,
        approved: rows.filter((r) => r.status === "approved").length,
        value,
      };
    },
  });

  const cards = useMemo(
    () => [
      ["Total investors", stats.data ? String(stats.data.investors) : "—"],
      ["Total applications", stats.data ? String(stats.data.applications) : "—"],
      ["Pending review", stats.data ? String(stats.data.pending) : "—"],
      ["Payment verification", stats.data ? String(stats.data.pendingPayments) : "—"],
      ["Approved", stats.data ? String(stats.data.approved) : "—"],
      ["Total investment value", stats.data ? formatCompact(stats.data.value) : "—"],
    ],
    [stats.data],
  );

  if (rolesLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-3xl">Restricted area</h1>
        <p className="mt-2 text-sm text-muted-foreground">You do not have permission to view this workspace.</p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Return to dashboard</Link>
        </Button>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil((apps.data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">{role.replace("_", " ")} workspace</p>
          <h1 className="mt-1 font-display text-4xl">Applications</h1>
        </div>
        {role !== "adviser" ? (
          <Button asChild variant="outline">
            <Link to="/admin/projects">Manage projects</Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="eyebrow text-muted-foreground">{label}</p>
            <p className="mt-2 font-display text-2xl">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Input
          value={term}
          onChange={(e) => {
            setPage(0);
            setTerm(e.target.value);
          }}
          placeholder="Search reference, investor name or email"
          className="max-w-sm"
          aria-label="Search applications"
        />
        <select
          value={status}
          onChange={(e) => {
            setPage(0);
            setStatus(e.target.value as ApplicationStatus | "");
          }}
          aria-label="Filter by status"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          {APPLICATION_STATUSES.filter((s) => s !== "draft").map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6">
        {apps.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : null}

        {apps.data?.rows.length === 0 ? (
          <EmptyState title="No applications found." body="Adjust your search or filters to see more results." />
        ) : null}

        <div className="hidden overflow-hidden rounded-lg border border-border md:block">
          {apps.data && apps.data.rows.length > 0 ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {["Reference", "Investor", "Project", "Amount", "Paid", "Status", "Date", ""].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {apps.data.rows.map((row) => {
                  const investment = (row.investment ?? {}) as { total_value?: number };
                  const personal = (row.personal ?? {}) as Record<string, string>;
                  const { paid } = totals(row.application_payments ?? [], Number(investment.total_value ?? 0));
                  return (
                    <tr key={row.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3 font-medium">{row.reference}</td>
                      <td className="px-4 py-3">{personal['full_name'] ?? "—"}</td>
                      <td className="px-4 py-3">{row.projects?.name ?? "—"}</td>
                      <td className="px-4 py-3">{formatNaira(investment.total_value ?? 0)}</td>
                      <td className="px-4 py-3">{formatNaira(paid)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status as ApplicationStatus} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(row.submitted_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/admin/applications/$appId" params={{ appId: row.id }}>
                            View
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>

        <div className="space-y-2 md:hidden">
          {apps.data?.rows.map((row) => {
            const investment = (row.investment ?? {}) as { total_value?: number };
            const personal = (row.personal ?? {}) as Record<string, string>;
            return (
              <Link
                key={row.id}
                to="/admin/applications/$appId"
                params={{ appId: row.id }}
                className="block rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow text-muted-foreground">{row.reference}</p>
                  <StatusBadge status={row.status as ApplicationStatus} />
                </div>
                <p className="mt-2 text-sm font-semibold">{personal['full_name'] ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {row.projects?.name ?? "—"} · {formatNaira(investment.total_value ?? 0)}
                </p>
              </Link>
            );
          })}
        </div>

        {totalPages > 1 ? (
          <div className="mt-6 flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
