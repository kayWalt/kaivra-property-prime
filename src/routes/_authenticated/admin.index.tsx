import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/kaivra/StatusBadge";
import { StatusPicker } from "@/components/kaivra/StatusPicker";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { PassportAvatar } from "@/components/kaivra/PassportAvatar";
import { usePassportAvatars } from "@/hooks/usePassportAvatars";
import { useRoles, useSession, primaryRole, isStaffRole } from "@/hooks/useAuth";
import { totals } from "@/lib/applications";
import {
  APPLICATION_STATUSES,
  STATUS_LABEL,
  formatCompact,
  formatDate,
  formatNaira,
  ROLE_LABEL,
  type AppRole,
  type ApplicationStatus,
} from "@/lib/kaivra";
import { RequireModule } from "@/components/kaivra/RequireModule";
import {
  PAYMENT_STATE_LABEL,
  paymentState,
  type PartnerPaymentState,
} from "@/lib/partner-pricing";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Management Workspace" },
      {
        name: "description",
        content: "Review investor applications, verify payments and manage projects.",
      },
      { property: "og:title", content: "KAIVRA | Management Workspace" },
      { property: "og:description", content: "Review applications and verify payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireModule module="applications" allowAdviser>
      <AdminDashboard />
    </RequireModule>
  ),
});

const PAGE_SIZE = 20;

function AdminDashboard() {
  const { user } = useSession();
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const role = primaryRole(roles);
  const staff = isStaffRole(role);

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<"" | ApplicationStatus>("");
  const [applicantType, setApplicantType] = useState<"" | "investor" | AppRole>("");
  const [payState, setPayState] = useState<"" | PartnerPaymentState>("");
  const [page, setPage] = useState(0);
  const [debouncedTerm, setDebouncedTerm] = useState("");

  // Typing stays local and instant; only the settled term hits the database.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTerm(term), 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  const apps = useQuery({
    queryKey: ["admin-applications", debouncedTerm, status, applicantType, page],
    enabled: staff,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("applications")
        .select(
          "id, reference, partner_reference, application_type, standard_price, discount_percent, negotiated_price, discount_approval, status, investor_id, created_at, submitted_at, investment, personal, contact, projects(name), properties(name), application_payments(amount, status)",
          { count: "exact" },
        )
        .neq("status", "draft")
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status) query = query.eq("status", status);
      if (applicantType === "investor") {
        query = query.eq("application_type", "investor");
      } else if (applicantType) {
        // Applicant role comes from the authenticated role table, never from
        // anything typed into the application itself.
        const { data: holders } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", applicantType);
        const ids = (holders ?? []).map((r) => r.user_id);
        query = query.in("investor_id", ids.length > 0 ? ids : [
          "00000000-0000-0000-0000-000000000000",
        ]);
      }
      if (debouncedTerm.trim()) {
        const q = `%${debouncedTerm.trim()}%`;
        query = query.or(
          `reference.ilike.${q},partner_reference.ilike.${q},personal->>full_name.ilike.${q},contact->>email.ilike.${q}`,
        );
      }
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const stats = useQuery({
    queryKey: ["admin-stats"],
    enabled: staff,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id, status, investor_id, investment, application_payments(amount, status)")
        .neq("status", "draft");
      if (error) throw error;
      const rows = data ?? [];
      const investors = new Set(rows.map((r) => r.investor_id));
      const value = rows.reduce(
        (sum, r) =>
          sum + Number(((r.investment ?? {}) as { total_value?: number }).total_value ?? 0),
        0,
      );
      const pendingPayments = rows.reduce(
        (sum, r) =>
          sum + (r.application_payments ?? []).filter((p) => p.status === "pending").length,
        0,
      );
      const { count: inspectionCount } = await supabase
        .from("inspection_appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "requested");
      return {
        inspections: inspectionCount ?? 0,
        investors: investors.size,
        applications: rows.length,
        pending: rows.filter((r) => r.status === "submitted" || r.status === "under_review").length,
        pendingPayments,
        approved: rows.filter((r) => r.status === "approved").length,
        value,
      };
    },
  });

  const visibleRows = useMemo(() => {
    const rows = apps.data?.rows ?? [];
    if (!payState) return rows;
    return rows.filter((r) => {
      const total = Number(
        r.negotiated_price ?? ((r.investment ?? {}) as { total_value?: number }).total_value ?? 0,
      );
      const { paid } = totals(r.application_payments ?? [], total);
      return paymentState(paid, total) === payState;
    });
  }, [apps.data, payState]);

  const investorIds = useMemo(
    () => visibleRows.map((r) => r.investor_id),
    [visibleRows],
  );
  const { avatars, isLoading: avatarsLoading } = usePassportAvatars(investorIds);

  const cards = useMemo(
    () => [
      ["Total investors", stats.data ? String(stats.data.investors) : "—"],
      ["Total applications", stats.data ? String(stats.data.applications) : "—"],
      ["Pending review", stats.data ? String(stats.data.pending) : "—"],
      ["Payment verification", stats.data ? String(stats.data.pendingPayments) : "—"],
      ["Inspection requests", stats.data ? String(stats.data.inspections) : "—"],
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
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this workspace.
        </p>
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
        <select
          value={applicantType}
          onChange={(e) => {
            setPage(0);
            setApplicantType(e.target.value as "" | "investor" | AppRole);
          }}
          aria-label="Filter by applicant type"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All applicants</option>
          <option value="investor">Investor applications</option>
          <option value="partner">Partner</option>
          <option value="adviser">Adviser</option>
          <option value="super_admin">Super Admin</option>
        </select>
        <select
          value={payState}
          onChange={(e) => setPayState(e.target.value as "" | PartnerPaymentState)}
          aria-label="Filter by payment state"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Any payment state</option>
          {(["unpaid", "partially_paid", "fully_paid"] as PartnerPaymentState[]).map((s) => (
            <option key={s} value={s}>
              {PAYMENT_STATE_LABEL[s]}
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

        {apps.data && visibleRows.length === 0 ? (
          <EmptyState
            title="No applications found."
            body="Adjust your search or filters to see more results."
          />
        ) : null}

        <div className="hidden overflow-hidden rounded-lg border border-border md:block">
          {visibleRows.length > 0 ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {["Reference", "Investor", "Project", "Amount", "Paid", "Status", "Date", ""].map(
                    (h) => (
                      <th key={h} scope="col" className="px-4 py-3 font-semibold">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleRows.map((row) => {
                  const investment = (row.investment ?? {}) as { total_value?: number };
                  const personal = (row.personal ?? {}) as Record<string, string>;
                  const isPartner = row.application_type === "partner";
                  const total = Number(
                    isPartner ? (row.negotiated_price ?? 0) : (investment.total_value ?? 0),
                  );
                  const { paid } = totals(row.application_payments ?? [], total);
                  const payLabel = PAYMENT_STATE_LABEL[paymentState(paid, total)];
                  return (
                    <tr key={row.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3 font-medium">
                        {isPartner ? (row.partner_reference ?? row.reference) : row.reference}
                        {isPartner ? (
                          <span className="mt-1 block text-[11px] font-normal uppercase tracking-wide text-primary">
                            Partner purchase
                            {row.discount_percent
                              ? ` · ${Number(row.discount_percent)}% off`
                              : ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <PassportAvatar
                            url={avatars[row.investor_id]}
                            name={personal["full_name"]}
                            loading={avatarsLoading}
                            className="size-9"
                            textClassName="text-[11px]"
                          />
                          <span>{personal["full_name"] ?? "—"}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">{row.projects?.name ?? "—"}</td>
                      <td className="px-4 py-3">{formatNaira(total)}</td>
                      <td className="px-4 py-3">
                        {formatNaira(paid)}
                        <span className="block text-[11px] text-muted-foreground">{payLabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status as ApplicationStatus} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(row.submitted_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <StatusPicker
                            applicationId={row.id}
                            reference={row.reference}
                            investorId={row.investor_id}
                            current={row.status as ApplicationStatus}
                            reviewerId={user?.id}
                            canDecide={role === "admin" || role === "super_admin"}
                            onUpdated={() => {
                              void apps.refetch();
                              void stats.refetch();
                            }}
                          />
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/admin/applications/$appId" params={{ appId: row.id }}>
                              View
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>

        <div className="space-y-2 md:hidden">
          {visibleRows.map((row) => {
            const investment = (row.investment ?? {}) as { total_value?: number };
            const personal = (row.personal ?? {}) as Record<string, string>;
            return (
              <div key={row.id} className="rounded-lg border border-border bg-card p-4">
                <Link to="/admin/applications/$appId" params={{ appId: row.id }} className="block">
                  <div className="flex items-center justify-between gap-3">
                    <p className="eyebrow text-muted-foreground">{row.reference}</p>
                    <StatusBadge status={row.status as ApplicationStatus} />
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <PassportAvatar
                      url={avatars[row.investor_id]}
                      name={personal["full_name"]}
                      loading={avatarsLoading}
                      className="size-10"
                      textClassName="text-xs"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {personal["full_name"] ?? "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.projects?.name ?? "—"} · {formatNaira(investment.total_value ?? 0)}
                      </p>
                    </div>
                  </div>
                </Link>
                <div className="mt-3">
                  <StatusPicker
                    applicationId={row.id}
                    reference={row.reference}
                    investorId={row.investor_id}
                    current={row.status as ApplicationStatus}
                    reviewerId={user?.id}
                    canDecide={role === "admin" || role === "super_admin"}
                    onUpdated={() => {
                      void apps.refetch();
                      void stats.refetch();
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {totalPages > 1 ? (
          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
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
