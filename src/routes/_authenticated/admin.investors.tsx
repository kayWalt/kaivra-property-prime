import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus, PlusCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { InvestorPicker } from "@/components/kaivra/InvestorPicker";
import { StatusBadge } from "@/components/kaivra/StatusBadge";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { PassportAvatar } from "@/components/kaivra/PassportAvatar";
import { usePassportAvatars } from "@/hooks/usePassportAvatars";
import { useRoles, useSession, primaryRole, isStaffRole } from "@/hooks/useAuth";
import {
  createAssistedApplication,
  registerInvestor,
  type InvestorSummary,
} from "@/lib/investors.functions";
import { formatNaira, formatDate, type ApplicationStatus } from "@/lib/kaivra";


export const Route = createFileRoute("/_authenticated/admin/investors")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Investors" },
      {
        name: "description",
        content: "Review every investor and the applications they hold with KAIVRA.",
      },
      { property: "og:title", content: "KAIVRA | Investors" },
      {
        property: "og:description",
        content: "Investor directory for KAIVRA advisers and administrators.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvestorsPage,
});

type Row = {
  id: string;
  reference: string | null;
  status: ApplicationStatus;
  submitted_at: string | null;
  created_at: string;
  investor_id: string;
  personal: unknown;
  contact: unknown;
  investment: unknown;
  projects: { name: string } | null;
};

type Investor = {
  id: string;
  name: string;
  email: string;
  phone: string;
  applications: Row[];
  value: number;
  latest: Row | undefined;
};

function InvestorsPage() {
  const { user } = useSession();
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const staff = isStaffRole(primaryRole(roles));
  const [term, setTerm] = useState("");

  // RLS already scopes this to the applications this staff member may see.
  const query = useQuery({
    queryKey: ["admin-investors"],
    enabled: staff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(
          "id, reference, status, submitted_at, created_at, investor_id, personal, contact, investment, projects(name)",
        )
        .neq("status", "draft")
        .order("submitted_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const investors = useMemo<Investor[]>(() => {
    const map = new Map<string, Investor>();
    for (const row of query.data ?? []) {
      const personal = (row.personal ?? {}) as { full_name?: string };
      const contact = (row.contact ?? {}) as { email?: string; phone?: string };
      const investment = (row.investment ?? {}) as { total_value?: number };
      const existing = map.get(row.investor_id);
      if (existing) {
        existing.applications.push(row);
        existing.value += Number(investment.total_value ?? 0);
        if (!existing.name && personal.full_name) existing.name = personal.full_name;
      } else {
        map.set(row.investor_id, {
          id: row.investor_id,
          name: personal.full_name ?? "Unnamed investor",
          email: contact.email ?? "—",
          phone: contact.phone ?? "—",
          applications: [row],
          value: Number(investment.total_value ?? 0),
          latest: row,
        });
      }
    }
    const list = [...map.values()];
    const needle = term.trim().toLowerCase();
    return needle
      ? list.filter((i) => `${i.name} ${i.email} ${i.phone}`.toLowerCase().includes(needle))
      : list;
  }, [query.data, term]);

  const { avatars, isLoading: avatarsLoading } = usePassportAvatars(investors.map((i) => i.id));

  if (rolesLoading) return <Skeleton className="h-40 w-full" />;
  if (!staff) {
    return (
      <EmptyState
        title="Not available"
        body="This workspace is for KAIVRA advisers and administrators."
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Directory</p>
        <h1 className="font-display text-3xl">Investors</h1>
        <p className="text-sm text-muted-foreground">
          Everyone with an application you are authorised to review.
        </p>
      </header>

      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by name, email or phone"
        className="max-w-md"
      />

      {query.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : investors.length === 0 ? (
        <EmptyState
          title="No investors yet"
          body="Investors appear here once they submit an application."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {investors.map((investor) => (
            <article
              key={investor.id}
              className="min-w-0 rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <PassportAvatar
                    url={avatars[investor.id]}
                    name={investor.name}
                    loading={avatarsLoading}
                    className="size-12 sm:size-14"
                  />
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-xl">{investor.name}</h2>
                    <p className="truncate text-sm text-muted-foreground">{investor.email}</p>
                    <p className="text-sm text-muted-foreground">{investor.phone}</p>
                  </div>
                </div>
                {investor.latest ? <StatusBadge status={investor.latest.status} /> : null}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                    Applications
                  </dt>
                  <dd className="font-semibold">{investor.applications.length}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                    Total value
                  </dt>
                  <dd className="font-semibold break-words">{formatNaira(investor.value)}</dd>
                </div>
              </dl>

              <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                {investor.applications.map((app) => (
                  <li key={app.id} className="flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {app.reference ?? "—"} · {app.projects?.name ?? "—"}
                    </span>
                    <span className="flex items-center gap-3 whitespace-nowrap text-muted-foreground">
                      {formatDate(app.submitted_at ?? app.created_at)}
                      <Link
                        to="/admin/applications/$appId"
                        params={{ appId: app.id }}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        View
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
