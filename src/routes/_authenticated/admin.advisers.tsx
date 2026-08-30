import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendAdviserInvitation } from "@/lib/advisers.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { EmptyState } from "@/components/kaivra/EmptyState";
import { UserAvatar } from "@/components/kaivra/UserAvatar";
import { useRoles, useSession, useProfile, primaryRole } from "@/hooks/useAuth";
import { STATUS_LABEL, type ApplicationStatus } from "@/lib/kaivra";

export const Route = createFileRoute("/_authenticated/admin/advisers")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Advisers" },
      { name: "description", content: "Assign KAIVRA advisers to the real estate projects they manage." },
      { property: "og:title", content: "KAIVRA | Advisers" },
      { property: "og:description", content: "Manage adviser access to KAIVRA projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdvisersPage,
});

type ProjectRow = { id: string; name: string; location: string; is_active: boolean };

type ApplicationRow = { id: string; status: ApplicationStatus; project_id: string | null };

type Adviser = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  projectIds: string[];
};

type LookupResult =
  | { kind: "none"; email: string }
  | {
      kind: "found";
      email: string;
      profile: { id: string; full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null };
      roles: string[];
    };

const AUDIT = {
  granted: "ADVISER_ROLE_GRANTED",
  revoked: "ADVISER_ROLE_REVOKED",
  assigned: "PROJECT_ASSIGNED_TO_ADVISER",
  removed: "PROJECT_ACCESS_REMOVED",
  invited: "INVITATION_SENT",
} as const;

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function AdvisersPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const { data: myProfile } = useProfile(user?.id);
  const role = primaryRole(roles);
  const canManage = role === "admin" || role === "super_admin";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [addOpen, setAddOpen] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  useEffect(() => {
    if (!rolesLoading && roles && !canManage) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [rolesLoading, roles, canManage, navigate]);

  async function logAudit(entry: {
    action: string;
    subject_user?: string | null;
    project_id?: string | null;
    detail?: Record<string, unknown>;
  }) {
    if (!user) return;
    const { error } = await supabase.from("admin_audit_events").insert({
      actor: user.id,
      actor_name: myProfile?.full_name ?? myProfile?.email ?? user.email ?? null,
      action: entry.action,
      subject_user: entry.subject_user ?? null,
      project_id: entry.project_id ?? null,
      detail: entry.detail ?? {},
    });
    if (error) console.error("audit log failed", error.message);
  }

  const projectsQuery = useQuery({
    queryKey: ["adviser-admin-projects"],
    enabled: canManage,
    queryFn: async (): Promise<ProjectRow[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, location, is_active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProjectRow[];
    },
  });

  const applicationsQuery = useQuery({
    queryKey: ["adviser-admin-applications"],
    enabled: canManage,
    queryFn: async (): Promise<ApplicationRow[]> => {
      const { data, error } = await supabase.from("applications").select("id, status, project_id");
      if (error) throw error;
      return (data ?? []) as ApplicationRow[];
    },
  });

  const advisersQuery = useQuery({
    queryKey: ["admin-advisers"],
    enabled: canManage,
    queryFn: async (): Promise<Adviser[]> => {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "adviser");
      if (roleError) throw roleError;
      const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [];

      const [{ data: profileRows, error: profileError }, { data: assignments, error: assignError }] =
        await Promise.all([
          supabase.from("profiles").select("id, full_name, email, phone, avatar_url").in("id", ids),
          supabase.from("project_advisers").select("project_id, adviser_id").in("adviser_id", ids),
        ]);
      if (profileError) throw profileError;
      if (assignError) throw assignError;

      return ids.map((id) => {
        const profile = profileRows?.find((p) => p.id === id);
        return {
          id,
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? null,
          phone: profile?.phone ?? null,
          avatar_url: profile?.avatar_url ?? null,
          projectIds: (assignments ?? []).filter((a) => a.adviser_id === id).map((a) => a.project_id),
        };
      });
    },
  });

  const invitationsQuery = useQuery({
    queryKey: ["adviser-invitations"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("adviser_invitations")
        .select("id, email, full_name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-advisers"] });
    void queryClient.invalidateQueries({ queryKey: ["adviser-invitations"] });
  };

  const grantAdviser = useMutation({
    mutationFn: async (target: { id: string; email: string | null; name: string | null }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: target.id, role: "adviser" });
      if (error && error.code !== "23505") {
        throw new Error(
          error.code === "42501"
            ? "You do not have permission to perform this action."
            : "Unable to grant adviser access. Please try again.",
        );
      }
      await logAudit({
        action: AUDIT.granted,
        subject_user: target.id,
        detail: { email: target.email, name: target.name },
      });
      return target;
    },
    onSuccess: (target) => {
      toast.success("Adviser access granted successfully.");
      refresh();
      setAddOpen(false);
      setManageId(target.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeAdviser = useMutation({
    mutationFn: async (adviser: Adviser) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", adviser.id)
        .eq("role", "adviser");
      if (error) {
        throw new Error(
          error.code === "42501"
            ? "You do not have permission to perform this action."
            : "Unable to revoke adviser access. Please try again.",
        );
      }
      const { error: linkError } = await supabase.from("project_advisers").delete().eq("adviser_id", adviser.id);
      if (linkError) throw new Error("Adviser role removed, but project links could not be cleared.");
      await logAudit({ action: AUDIT.revoked, subject_user: adviser.id, detail: { email: adviser.email } });
    },
    onSuccess: () => {
      toast.success("Adviser access revoked.");
      setRevokeId(null);
      setManageId(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleAssignment = useMutation({
    mutationFn: async ({
      adviser,
      project,
      assigned,
    }: {
      adviser: Adviser;
      project: ProjectRow;
      assigned: boolean;
    }) => {
      if (assigned) {
        const { error } = await supabase
          .from("project_advisers")
          .delete()
          .eq("adviser_id", adviser.id)
          .eq("project_id", project.id);
        if (error) throw new Error("Unable to remove project access. Please try again.");
        await logAudit({
          action: AUDIT.removed,
          subject_user: adviser.id,
          project_id: project.id,
          detail: { project: project.name },
        });
        return { assigned: false };
      }
      const { error } = await supabase
        .from("project_advisers")
        .insert({ adviser_id: adviser.id, project_id: project.id });
      if (error) {
        if (error.code === "23505") throw new Error("This adviser is already assigned to this project.");
        throw new Error(
          error.code === "42501"
            ? "You do not have permission to perform this action."
            : "Unable to assign project. Please try again.",
        );
      }
      await logAudit({
        action: AUDIT.assigned,
        subject_user: adviser.id,
        project_id: project.id,
        detail: { project: project.name },
      });
      return { assigned: true };
    },
    onSuccess: (result) => {
      toast.success(result.assigned ? "Project assigned successfully." : "Project access removed.");
      void queryClient.invalidateQueries({ queryKey: ["admin-advisers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const advisers = advisersQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const applications = applicationsQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return advisers;
    return advisers.filter((a) =>
      [a.full_name, a.email, a.phone].some((value) => (value ?? "").toLowerCase().includes(q)),
    );
  }, [advisers, debouncedSearch]);

  const appsFor = (projectIds: string[]) =>
    applications.filter((app) => app.project_id && projectIds.includes(app.project_id));

  const manageAdviser = advisers.find((a) => a.id === manageId) ?? null;
  const revokeTarget = advisers.find((a) => a.id === revokeId) ?? null;

  if (rolesLoading || !roles) return <Skeleton className="h-64 w-full" />;
  if (!canManage) {
    return <EmptyState title="Not available" body="Only KAIVRA administrators can manage advisers." />;
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Administration</p>
        <h1 className="font-display text-3xl sm:text-4xl">Advisers</h1>
        <p className="text-sm text-muted-foreground">Manage adviser access and project permissions.</p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search advisers…"
            aria-label="Search advisers"
            className="h-12 pl-9"
          />
        </div>
        <Button className="h-12 transition-transform active:scale-[0.98]" onClick={() => setAddOpen(true)}>
          <UserPlus className="mr-2 size-4" /> Add adviser
        </Button>
      </div>

      {advisersQuery.isLoading || applicationsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : advisersQuery.isError ? (
        <EmptyState
          title="Unable to load advisers"
          body="Something went wrong while reading adviser records. Please try again."
          action={<Button onClick={() => advisersQuery.refetch()}>Retry</Button>}
        />
      ) : advisers.length === 0 ? (
        <EmptyState
          title="No advisers yet"
          body="Grant adviser access to build your investment advisory team."
          action={
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-2 size-4" /> Add adviser
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No advisers found" body="No adviser matches that name, email or phone number." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-4 font-medium">Adviser</th>
                  <th className="px-5 py-4 font-medium">Email</th>
                  <th className="px-5 py-4 font-medium">Projects</th>
                  <th className="px-5 py-4 font-medium">Applications</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((adviser) => (
                  <tr key={adviser.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <UserAvatar url={adviser.avatar_url} name={adviser.full_name} />
                        <span className="font-medium">{adviser.full_name ?? "Unnamed adviser"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{adviser.email ?? "—"}</td>
                    <td className="px-5 py-4">
                      {adviser.projectIds.length} {adviser.projectIds.length === 1 ? "Project" : "Projects"}
                    </td>
                    <td className="px-5 py-4">{appsFor(adviser.projectIds).length} Applications</td>
                    <td className="px-5 py-4">
                      <Badge variant="secondary">Active</Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button variant="outline" size="sm" onClick={() => setManageId(adviser.id)}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet cards */}
          <div className="grid gap-3 lg:hidden">
            {filtered.map((adviser) => (
              <article
                key={adviser.id}
                className="rounded-xl border border-border bg-card p-5 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-3">
                  <UserAvatar url={adviser.avatar_url} name={adviser.full_name} className="size-11" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-xl">{adviser.full_name ?? "Unnamed adviser"}</h2>
                    <p className="truncate text-sm text-muted-foreground">{adviser.email ?? "—"}</p>
                    {adviser.phone ? <p className="text-sm text-muted-foreground">{adviser.phone}</p> : null}
                  </div>
                  <Badge variant="secondary">Active</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">Projects</dt>
                    <dd className="mt-1 font-medium">{adviser.projectIds.length}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-widest text-muted-foreground">Applications</dt>
                    <dd className="mt-1 font-medium">{appsFor(adviser.projectIds).length}</dd>
                  </div>
                </dl>
                <Button variant="outline" className="mt-4 h-11 w-full" onClick={() => setManageId(adviser.id)}>
                  Manage
                </Button>
              </article>
            ))}
          </div>
        </>
      )}

      {(invitationsQuery.data ?? []).filter((i) => i.status === "pending").length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Pending invitations</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(invitationsQuery.data ?? [])
              .filter((i) => i.status === "pending")
              .map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{invite.full_name ? `${invite.full_name} · ${invite.email}` : invite.email}</span>
                  <Badge variant="outline">Invited</Badge>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <AddAdviserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projects={projects.filter((p) => p.is_active)}
        onGrant={(target) => grantAdviser.mutate(target)}
        granting={grantAdviser.isPending}
        onInvited={(email) => {
          void logAudit({ action: AUDIT.invited, detail: { email } });
          refresh();
        }}
      />

      <Sheet open={Boolean(manageAdviser)} onOpenChange={(open) => !open && setManageId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {manageAdviser ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-display text-2xl">Adviser profile</SheetTitle>
                <SheetDescription>Project access and application visibility for this adviser.</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-8 pb-10">
                <div className="flex items-center gap-4">
                  <UserAvatar url={manageAdviser.avatar_url} name={manageAdviser.full_name} className="size-14" />
                  <div className="min-w-0">
                    <p className="font-display text-xl">{manageAdviser.full_name ?? "Unnamed adviser"}</p>
                    <p className="truncate text-sm text-muted-foreground">{manageAdviser.email ?? "—"}</p>
                    <p className="text-sm text-muted-foreground">{manageAdviser.phone ?? "No phone on file"}</p>
                  </div>
                  <Badge variant="secondary" className="ml-auto">
                    Active
                  </Badge>
                </div>

                <section className="space-y-3">
                  <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Project access</h3>
                  {projectsQuery.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No projects exist yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {projects.map((project) => {
                        const assigned = manageAdviser.projectIds.includes(project.id);
                        const busy =
                          toggleAssignment.isPending &&
                          toggleAssignment.variables?.project.id === project.id &&
                          toggleAssignment.variables?.adviser.id === manageAdviser.id;
                        return (
                          <div
                            key={project.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 p-4 transition-colors hover:border-primary/40"
                          >
                            <div className="min-w-0">
                              <p className="font-medium">{project.name}</p>
                              <p className="text-sm text-muted-foreground">{project.location || "—"}</p>
                              <p className="text-xs text-muted-foreground">
                                {applications.filter((a) => a.project_id === project.id).length} applications ·{" "}
                                {project.is_active ? "Active" : "Inactive"}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant={assigned ? "outline" : "default"}
                              disabled={busy}
                              onClick={() =>
                                toggleAssignment.mutate({ adviser: manageAdviser, project, assigned })
                              }
                            >
                              {busy ? (
                                <>
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                  {assigned ? "Removing…" : "Assigning…"}
                                </>
                              ) : assigned ? (
                                <>
                                  <Trash2 className="mr-2 size-4" /> Remove access
                                </>
                              ) : (
                                "Assign"
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Application access</h3>
                  <AccessStats rows={appsFor(manageAdviser.projectIds)} />
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Account status</h3>
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <span className="flex items-center gap-2 text-sm">
                      <ShieldCheck className="size-4 text-primary" /> Adviser access
                    </span>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                  <Button
                    variant="destructive"
                    className="h-12 w-full"
                    onClick={() => setRevokeId(manageAdviser.id)}
                  >
                    Revoke adviser access
                  </Button>
                </section>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => !open && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke adviser access?</AlertDialogTitle>
            <AlertDialogDescription>
              This adviser will no longer be able to access applications belonging to assigned projects. Their
              investor account, if any, will remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeAdviser.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={revokeAdviser.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (revokeTarget) revokeAdviser.mutate(revokeTarget);
              }}
            >
              {revokeAdviser.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Revoking…
                </>
              ) : (
                "Revoke access"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AccessStats({ rows }: { rows: ApplicationRow[] }) {
  const counts = (status: ApplicationStatus) => rows.filter((r) => r.status === status).length;
  const items: { label: string; value: number }[] = [
    { label: "Applications", value: rows.length },
    { label: STATUS_LABEL.submitted, value: counts("submitted") },
    { label: STATUS_LABEL.under_review, value: counts("under_review") },
    { label: STATUS_LABEL.payment_verification, value: counts("payment_verification") },
    { label: STATUS_LABEL.approved, value: counts("approved") },
    { label: STATUS_LABEL.requires_correction, value: counts("requires_correction") },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-border p-4">
          <dt className="text-xs uppercase tracking-widest text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 font-display text-2xl">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AddAdviserDialog({
  open,
  onOpenChange,
  projects,
  onGrant,
  granting,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectRow[];
  onGrant: (target: { id: string; email: string | null; name: string | null }) => void;
  granting: boolean;
  onInvited: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [inviteProjects, setInviteProjects] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setFullName("");
      setPhone("");
      setResult(null);
      setInviteProjects([]);
    }
  }, [open]);

  const lookup = useMutation({
    mutationFn: async (value: string): Promise<LookupResult> => {
      const target = value.trim().toLowerCase();
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, avatar_url")
        .ilike("email", target)
        .maybeSingle();
      if (error) throw new Error("Unable to find this account. Please check the email address.");
      if (!profile) return { kind: "none", email: target };
      const { data: roleRows, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", profile.id);
      if (rolesError) throw new Error("Unable to read this account's permissions.");
      return { kind: "found", email: target, profile, roles: (roleRows ?? []).map((r) => r.role as string) };
    },
    onSuccess: setResult,
    onError: (error: Error) => toast.error(error.message),
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!result || result.kind !== "none") return;
      await sendAdviserInvitation({
        data: {
          email: result.email,
          fullName: fullName.trim() || null,
          phone: phone.trim() || null,
          projectIds: inviteProjects,
          redirectTo: `${window.location.origin}/auth`,
        },
      });
      return result.email;
    },
    onSuccess: (invitedEmail) => {
      toast.success("Invitation sent successfully.");
      if (invitedEmail) onInvited(invitedEmail);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "Invitation could not be sent."),
  });

  const isAdviser = result?.kind === "found" && result.roles.includes("adviser");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add adviser</DialogTitle>
          <DialogDescription>
            Grant adviser access to KAIVRA and assign project permissions.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const value = email.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              toast.error("Enter a valid email address.");
              return;
            }
            setResult(null);
            lookup.mutate(value);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="lookup-email">Email address</Label>
            <div className="flex gap-2">
              <Input
                id="lookup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter adviser email"
                className="h-12"
                required
              />
              <Button type="submit" className="h-12" disabled={lookup.isPending}>
                {lookup.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Checking…
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </div>
        </form>

        {result?.kind === "found" ? (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              <UserAvatar url={result.profile.avatar_url} name={result.profile.full_name} className="size-12" />
              <div className="min-w-0">
                <p className="font-medium">{result.profile.full_name ?? "Unnamed user"}</p>
                <p className="truncate text-sm text-muted-foreground">{result.profile.email}</p>
                {result.profile.phone ? (
                  <p className="text-sm text-muted-foreground">{result.profile.phone}</p>
                ) : null}
                <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                  Current role: {result.roles.join(", ") || "investor"}
                </p>
              </div>
            </div>

            {isAdviser ? (
              <p className="text-sm text-muted-foreground">
                This user is already an adviser. Close this dialog and use Manage to review their projects.
              </p>
            ) : (
              <>
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  This will give this user adviser access to KAIVRA. You can choose the real estate projects they
                  are permitted to review next.
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={granting}>
                    Cancel
                  </Button>
                  <Button
                    disabled={granting}
                    onClick={() =>
                      onGrant({
                        id: result.profile.id,
                        email: result.profile.email,
                        name: result.profile.full_name,
                      })
                    }
                  >
                    {granting ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Granting access…
                      </>
                    ) : (
                      "Grant adviser access"
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        ) : null}

        {result?.kind === "none" ? (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">No KAIVRA account found for {result.email}.</p>
            <h3 className="font-display text-xl">Invite adviser</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invite-name">Full name (optional)</Label>
                <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-phone">Phone number (optional)</Label>
                <Input id="invite-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12" />
              </div>
            </div>
            {projects.length > 0 ? (
              <div className="space-y-2">
                <Label>Projects to assign once they accept</Label>
                <div className="flex flex-wrap gap-2">
                  {projects.map((project) => {
                    const selected = inviteProjects.includes(project.id);
                    return (
                      <Button
                        key={project.id}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        onClick={() =>
                          setInviteProjects((prev) =>
                            selected ? prev.filter((id) => id !== project.id) : [...prev, project.id],
                          )
                        }
                      >
                        {project.name}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
                Cancel
              </Button>
              <Button onClick={() => invite.mutate()} disabled={invite.isPending}>
                {invite.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Sending invitation…
                  </>
                ) : (
                  "Send adviser invitation"
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
