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
  code: string | null;
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
  const role = primaryRole(roles);
  const staff = isStaffRole(role);
  const isAdmin = role === "admin" || role === "super_admin";
  const [term, setTerm] = useState("");
  const navigate = useNavigate();

  const startAssisted = useServerFn(createAssistedApplication);
  const register = useServerFn(registerInvestor);

  const [existingOpen, setExistingOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [picked, setPicked] = useState<InvestorSummary | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });

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

  // Permanent KAIVRA Investor IDs live on profiles; staff may read them.
  const profilesQuery = useQuery({
    queryKey: ["admin-investor-profiles"],
    enabled: staff,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, investor_code, full_name, email, phone, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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
          code: null,
          name: personal.full_name ?? "Unnamed investor",
          email: contact.email ?? "—",
          phone: contact.phone ?? "—",
          applications: [row],
          value: Number(investment.total_value ?? 0),
          latest: row,
        });
      }
    }

    for (const profile of profilesQuery.data ?? []) {
      const existing = map.get(profile.id);
      if (existing) {
        existing.code = profile.investor_code;
        if (existing.name === "Unnamed investor" && profile.full_name)
          existing.name = profile.full_name;
        if (existing.email === "—" && profile.email) existing.email = profile.email;
        if (existing.phone === "—" && profile.phone) existing.phone = profile.phone;
      } else if (isAdmin) {
        // Registered investors with no submitted investment yet.
        map.set(profile.id, {
          id: profile.id,
          code: profile.investor_code,
          name: profile.full_name ?? "Unnamed investor",
          email: profile.email ?? "—",
          phone: profile.phone ?? "—",
          applications: [],
          value: 0,
          latest: undefined,
        });
      }
    }

    const list = [...map.values()].sort((a, b) => b.applications.length - a.applications.length);
    const needle = term.trim().toLowerCase();
    return needle
      ? list.filter((i) =>
          `${i.code ?? ""} ${i.name} ${i.email} ${i.phone} ${i.applications
            .map((a) => a.reference ?? "")
            .join(" ")}`
            .toLowerCase()
            .includes(needle),
        )
      : list;
  }, [query.data, profilesQuery.data, term, isAdmin]);

  const { avatars, isLoading: avatarsLoading } = usePassportAvatars(investors.map((i) => i.id));

  async function openInvestment(investorId: string) {
    const { applicationId } = await startAssisted({ data: { investorId } });
    setExistingOpen(false);
    setRegisterOpen(false);
    setPicked(null);
    toast.success("Investment started", { description: "Complete the details for this investor." });
    void navigate({ to: "/application", search: { id: applicationId } });
  }

  async function handleRegister() {
    const fullName = form.fullName.trim();
    const email = form.email.trim();
    if (fullName.length < 2 || !email) {
      toast.error("Enter the investor's full name and email address.");
      return;
    }
    const { investor, created } = await register({
      data: { fullName, email, phone: form.phone.trim() || null },
    });
    toast.success(
      created ? `Investor registered · ${investor.investor_code ?? ""}` : "Existing investor found",
      {
        description: created
          ? "A permanent KAIVRA Investor ID has been issued."
          : "This email already belongs to an investor — their record was reused.",
      },
    );
    setForm({ fullName: "", email: "", phone: "" });
    await openInvestment(investor.id);
  }

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by Investor ID, name, email, phone or reference"
          className="max-w-md"
          aria-label="Search investors"
        />
        <div className="flex flex-wrap gap-2">
          <AsyncButton
            variant="outline"
            onClick={() => {
              setPicked(null);
              setExistingOpen(true);
            }}
          >
            <PlusCircle className="mr-2 size-4" aria-hidden />
            Add investment for existing investor
          </AsyncButton>
          {isAdmin ? (
            <AsyncButton onClick={() => setRegisterOpen(true)}>
              <UserPlus className="mr-2 size-4" aria-hidden />
              Register investor &amp; add investment
            </AsyncButton>
          ) : null}
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : investors.length === 0 ? (
        <EmptyState
          title="No investors yet"
          body="Investors appear here once they are registered or submit an application."
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
                    <p className="font-mono text-xs tracking-wide text-muted-foreground">
                      {investor.code ?? "—"}
                    </p>
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
                {investor.applications.length === 0 ? (
                  <li className="text-muted-foreground">No investments recorded yet.</li>
                ) : (
                  investor.applications.map((app) => (
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
                  ))
                )}
              </ul>

              <AsyncButton
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                pendingLabel="Starting…"
                onClick={() => openInvestment(investor.id)}
              >
                Add investment
              </AsyncButton>
            </article>
          ))}
        </div>
      )}

      <Dialog open={existingOpen} onOpenChange={setExistingOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add investment for existing investor</DialogTitle>
            <DialogDescription>
              Search the existing investor identity — records are never duplicated.
            </DialogDescription>
          </DialogHeader>
          <InvestorPicker selected={picked} onSelect={setPicked} />
          <DialogFooter>
            <AsyncButton
              disabled={!picked}
              pendingLabel="Starting…"
              onClick={() => (picked ? openInvestment(picked.id) : undefined)}
            >
              Start investment
            </AsyncButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Register investor &amp; add investment</DialogTitle>
            <DialogDescription>
              A permanent KAIVRA Investor ID is issued automatically. If the email already exists,
              that investor is reused instead of creating a duplicate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Full name</Label>
              <Input
                id="inv-name"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Email address</Label>
              <Input
                id="inv-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-phone">Phone (optional)</Label>
              <Input
                id="inv-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <AsyncButton pendingLabel="Registering…" onClick={handleRegister}>
              Register &amp; start investment
            </AsyncButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

