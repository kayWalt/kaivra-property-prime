import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, History, Clock, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { ToneBadge } from "@/components/kaivra/StatusBadge";
import { useRoles, useSession, primaryRole } from "@/hooks/useAuth";
import {
  ADMIN_MODULES,
  DURATION_PRESETS,
  MODULE_ACTIONS,
  grantState,
  timeRemaining,
  type AdminAction,
  type AdminModule,
  type PermissionMatrix,
  type ProxyGrant,
} from "@/lib/proxy-admin";
import {
  grantProxyAdmin,
  listProxyAdmins,
  proxyAdminHistory,
  revokeProxyAdmin,
  updateProxyAdmin,
  type ProxyAdminRow,
} from "@/lib/proxy-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/access")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Admin Access" },
      {
        name: "description",
        content: "Delegate temporary, permission-scoped KAIVRA Proxy Admin access.",
      },
      { property: "og:title", content: "KAIVRA | Admin Access" },
      { property: "og:description", content: "Super Admin control of KAIVRA Proxy Admins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminAccessPage,
});

const STATE_TONE = {
  active: "emerald",
  scheduled: "gold",
  expired: "neutral",
  revoked: "red",
  suspended: "gold",
} as const;

function fmt(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function AdminAccessPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const role = primaryRole(roles);
  const isSuperAdmin = role === "super_admin";
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<ProxyAdminRow | null>(null);
  const [historyUser, setHistoryUser] = useState<ProxyAdminRow | null>(null);
  const [revokeUser, setRevokeUser] = useState<ProxyAdminRow | null>(null);

  useEffect(() => {
    if (!rolesLoading && roles && !isSuperAdmin) {
      toast.error("Access restricted. Only a KAIVRA Super Admin can manage admin access.");
      navigate({ to: "/dashboard", replace: true });
    }
  }, [rolesLoading, roles, isSuperAdmin, navigate]);

  const listQuery = useQuery({
    queryKey: ["proxy-admins"],
    enabled: isSuperAdmin,
    refetchInterval: 60_000,
    queryFn: async () => (await listProxyAdmins()).proxyAdmins as ProxyAdminRow[],
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["proxy-admins"] });
    void queryClient.invalidateQueries({ queryKey: ["proxy-grant"] });
  };

  const revokeMutation = useMutation({
    mutationFn: async (userId: string) => revokeProxyAdmin({ data: { userId } }),
    onSuccess: () => {
      toast.success("Proxy Admin access revoked immediately.");
      setRevokeUser(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isSuperAdmin) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Administration</p>
          <h1 className="font-display text-3xl">Admin Access</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Delegate temporary, explicitly scoped administrative authority. Proxy Admins never
            inherit Super Admin powers, and every permission is enforced in the database.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="mr-2 size-4" /> Create Proxy Admin
        </Button>
      </div>

      <div className="mt-8 space-y-4">
        {listQuery.isLoading ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : (listQuery.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No Proxy Admins yet"
            body="Create one to delegate limited, time-boxed administrative access."
          />
        ) : (
          listQuery.data!.map((row) => {
            const grant = row.grant as ProxyGrant;
            const state = grantState(grant);
            const permissions = (grant.permissions ?? {}) as PermissionMatrix;
            return (
              <div key={row.user_id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <UserAvatar url={row.avatar_url} name={row.full_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{row.full_name || row.email}</p>
                      <ToneBadge tone={STATE_TONE[state]} label={state.toUpperCase()} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{row.email}</p>
                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                      <div>Access starts: {fmt(grant.starts_at)}</div>
                      <div>Expires: {grant.expires_at ? fmt(grant.expires_at) : "No expiry"}</div>
                      <div className="flex items-center gap-1">
                        <Clock className="size-3" /> {timeRemaining(grant.expires_at)}
                      </div>
                      <div>Created by: {row.granted_by_name ?? "—"}</div>
                      <div>Last login: {fmt(row.last_sign_in_at)}</div>
                      <div>Last updated: {fmt(grant.updated_at)}</div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {ADMIN_MODULES.filter((m) => (permissions[m.key] ?? []).length > 0).map(
                        (m) => (
                          <span
                            key={m.key}
                            className="rounded-full border border-border px-2 py-0.5 text-[0.68rem] text-muted-foreground"
                          >
                            {m.label}: {(permissions[m.key] ?? []).join(" / ")}
                          </span>
                        ),
                      )}
                      {ADMIN_MODULES.every((m) => (permissions[m.key] ?? []).length === 0) ? (
                        <span className="text-xs text-muted-foreground">No permissions granted</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditUser(row)}>
                      <ShieldCheck className="mr-2 size-4" /> Permissions & access
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setHistoryUser(row)}>
                      <History className="mr-2 size-4" /> History
                    </Button>
                    {state !== "revoked" ? (
                      <Button size="sm" variant="destructive" onClick={() => setRevokeUser(row)}>
                        <ShieldOff className="mr-2 size-4" /> Revoke
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <GrantDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => {
          setCreateOpen(false);
          refresh();
        }}
      />

      {editUser ? (
        <GrantDialog
          open
          existing={editUser}
          onOpenChange={(v) => !v && setEditUser(null)}
          onSaved={() => {
            setEditUser(null);
            refresh();
          }}
        />
      ) : null}

      <Sheet open={!!historyUser} onOpenChange={(v) => !v && setHistoryUser(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Access history</SheetTitle>
            <SheetDescription>
              Append-only digital footprint for {historyUser?.full_name || historyUser?.email}.
            </SheetDescription>
          </SheetHeader>
          {historyUser ? <HistoryList userId={historyUser.user_id} /> : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!revokeUser} onOpenChange={(v) => !v && setRevokeUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Proxy Admin access?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeUser?.full_name || revokeUser?.email} loses every administrative permission
              immediately, including any session already open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeUser && revokeMutation.mutate(revokeUser.user_id)}
            >
              Revoke now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function HistoryList({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ["proxy-admin-history", userId],
    queryFn: async () => (await proxyAdminHistory({ data: { userId } })).events,
  });
  if (query.isLoading) return <Skeleton className="mt-6 h-40 w-full" />;
  const events = query.data ?? [];
  if (events.length === 0)
    return <p className="mt-6 text-sm text-muted-foreground">No recorded activity yet.</p>;
  return (
    <ul className="mt-6 space-y-3">
      {events.map((e) => (
        <li key={e.id as string} className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">{String(e.action).replaceAll("_", " ").toLowerCase()}</p>
          <p className="text-xs text-muted-foreground">
            {fmt(e.created_at as string)} · {(e.actor_name as string) ?? "system"}
            {e.ip_address ? ` · ${e.ip_address as string}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function toLocalInput(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function GrantDialog({
  open,
  existing,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  existing?: ProxyAdminRow;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const grant = existing?.grant as ProxyGrant | undefined;
  const [email, setEmail] = useState(existing?.email ?? "");
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [note, setNote] = useState(grant?.note ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(grant?.starts_at ?? new Date().toISOString()));
  const [expiresAt, setExpiresAt] = useState(
    grant?.expires_at ? toLocalInput(grant.expires_at) : "",
  );
  const [permissions, setPermissions] = useState<PermissionMatrix>(
    (grant?.permissions ?? {}) as PermissionMatrix,
  );

  const dirtyPermissions = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(permissions).filter(([, actions]) => (actions ?? []).length > 0),
      ) as PermissionMatrix,
    [permissions],
  );

  function toggle(module: AdminModule, action: AdminAction, checked: boolean) {
    setPermissions((prev) => {
      const current = new Set(prev[module] ?? []);
      if (checked) {
        current.add(action);
        if (action !== "view") current.add("view");
      } else {
        current.delete(action);
        if (action === "view") current.clear();
      }
      return { ...prev, [module]: Array.from(current) };
    });
  }

  function applyPreset(hours: number) {
    const start = startsAt ? new Date(startsAt) : new Date();
    setExpiresAt(toLocalInput(new Date(start.getTime() + hours * 3600_000).toISOString()));
  }

  const save = useMutation({
    mutationFn: async () => {
      const startsIso = new Date(startsAt || Date.now()).toISOString();
      const expiresIso = expiresAt ? new Date(expiresAt).toISOString() : null;
      if (expiresIso && new Date(expiresIso) <= new Date(startsIso)) {
        throw new Error("The expiry must be after the access start time.");
      }
      if (Object.keys(dirtyPermissions).length === 0) {
        throw new Error("Grant at least one module permission.");
      }
      if (existing) {
        return updateProxyAdmin({
          data: {
            userId: existing.user_id,
            permissions: dirtyPermissions as Record<string, string[]>,
            startsAt: startsIso,
            expiresAt: expiresIso,
            note: note || null,
            status: "active",
          },
        });
      }
      return grantProxyAdmin({
        data: {
          email,
          fullName: fullName || null,
          permissions: dirtyPermissions as Record<string, string[]>,
          startsAt: startsIso,
          expiresAt: expiresIso,
          note: note || null,
          redirectTo: `${window.location.origin}/auth`,
        },
      });
    },
    onSuccess: () => {
      toast.success(existing ? "Proxy Admin access updated." : "Proxy Admin access granted.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Proxy Admin access" : "Create Proxy Admin"}</DialogTitle>
          <DialogDescription>
            Permissions are enforced server-side. Nothing is granted unless it is ticked here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {!existing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="proxy-email">Email</Label>
                <Input
                  id="proxy-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@kaivraa.com"
                />
                <p className="text-xs text-muted-foreground">
                  Existing users are reused; new addresses receive a secure invitation.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="proxy-name">Full name</Label>
                <Input
                  id="proxy-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="proxy-start">Access starts</Label>
              <Input
                id="proxy-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proxy-end">Access expires</Label>
              <Input
                id="proxy-end"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => applyPreset(p.hours)}
              >
                {p.label}
              </Button>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => setExpiresAt("")}>
              No expiry
            </Button>
          </div>

          <div className="space-y-3">
            <Label>Permission matrix</Label>
            <div className="space-y-2 rounded-lg border border-border p-3">
              {ADMIN_MODULES.map((m) => (
                <div key={m.key} className="flex flex-wrap items-center gap-3 border-b border-border/60 py-2 last:border-0">
                  <span className="w-40 text-sm font-medium">{m.label}</span>
                  {MODULE_ACTIONS[m.key].map((action) => {
                    const id = `${m.key}-${action}`;
                    return (
                      <label key={id} htmlFor={id} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          id={id}
                          checked={(permissions[m.key] ?? []).includes(action)}
                          onCheckedChange={(v) => toggle(m.key, action, v === true)}
                        />
                        {action}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Super Admin functions — managing admin access, secrets, security configuration and
              audit logs — can never be delegated.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proxy-note">Note (optional)</Label>
            <Textarea
              id="proxy-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for this delegation"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : existing ? "Save access" : "Grant access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
