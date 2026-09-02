import { useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRoles, useSession, primaryRole } from "@/hooks/useAuth";
import {
  EXPIRED_MESSAGE,
  buildAdminAccess,
  useMyProxyGrant,
  type AdminModule,
} from "@/lib/proxy-admin";
import { recordProxyAdminSessionEvent } from "@/lib/proxy-admin.functions";

/**
 * Route-level authorisation for an administrative module.
 *
 * This is a courtesy layer only: every read and write behind these screens is
 * independently re-authorised by the database (`private.admin_can`) and by the
 * server functions (`assertAdminCan`), so navigating straight to a URL, or
 * calling the API directly, gains nothing. Its job is to show an honest
 * "access denied" page instead of an empty screen, and to leave a footprint.
 */
export function RequireModule({
  module,
  children,
  /** Advisers are legitimate staff on some screens; opt in per route. */
  allowAdviser = false,
}: {
  module: AdminModule;
  children: ReactNode;
  allowAdviser?: boolean;
}) {
  const { user, loading } = useSession();
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const role = primaryRole(roles);
  const { data: grant, isLoading: grantLoading } = useMyProxyGrant(
    role === "admin" ? user?.id : undefined,
  );
  const access = buildAdminAccess(role, grant ?? null);

  const adviserAllowed = allowAdviser && role === "adviser";
  const permitted = adviserAllowed || access.can(module, "view");
  const busy = loading || rolesLoading || (role === "admin" && grantLoading);

  useEffect(() => {
    if (busy || permitted || !access.isProxyAdmin) return;
    void recordProxyAdminSessionEvent({
      data: { event: "DENIED", detail: `module:${module}` },
    }).catch(() => {});
  }, [busy, permitted, access.isProxyAdmin, module]);

  if (busy) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (permitted) return <>{children}</>;

  const expired = access.accessExpired;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-20 text-center sm:px-6">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <ShieldOff className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="font-serif text-2xl">
        {expired ? "Access expired" : "Authorisation required"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {expired
          ? EXPIRED_MESSAGE
          : "You do not have permission to open this KAIVRA module. Contact a Super Admin if you require access."}
      </p>
      <Button asChild variant="outline">
        <Link to={access.modules.length > 0 ? "/admin" : "/dashboard"}>
          {access.modules.length > 0 ? "Back to workspace" : "Back to dashboard"}
        </Link>
      </Button>
    </div>
  );
}
