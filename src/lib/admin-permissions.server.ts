/**
 * Server-side permission gate for privileged operations that run with the
 * service-role client (and therefore bypass RLS).
 *
 * It mirrors the database's `private.admin_can()` logic, but is evaluated with
 * the CALLER'S OWN RLS-scoped client, so nothing the browser sends can
 * influence the decision. It fails closed on any error.
 */
import type { AdminAction, AdminModule } from "@/lib/proxy-admin";

type CallerClient = { from: (table: string) => any };

const DENIED = "You do not have permission to perform this action.";
const EXPIRED =
  "Your KAIVRA Proxy Admin access has expired or been revoked. Contact a Super Admin.";

export async function resolveAdminAuthority(supabase: CallerClient, userId: string) {
  const { data: roleRows, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(DENIED);
  const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
  const isSuperAdmin = roles.includes("super_admin");
  const isAdmin = isSuperAdmin || roles.includes("admin");
  const isAdviser = roles.includes("adviser");

  let grant: {
    permissions: Record<string, string[]> | null;
    status: string;
    starts_at: string;
    expires_at: string | null;
  } | null = null;

  if (!isSuperAdmin && isAdmin) {
    const { data } = await supabase
      .from("proxy_admin_grants")
      .select("permissions, status, starts_at, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    grant = (data as typeof grant) ?? null;
  }

  const now = Date.now();
  const grantActive =
    !!grant &&
    grant.status === "active" &&
    new Date(grant.starts_at).getTime() <= now &&
    (!grant.expires_at || new Date(grant.expires_at).getTime() > now);

  return {
    roles,
    isSuperAdmin,
    isAdmin: isSuperAdmin || (isAdmin && (!grant || grantActive)),
    isAdviser,
    isProxyAdmin: !!grant,
    grantActive,
    can(module: AdminModule, action: AdminAction) {
      if (isSuperAdmin) return true;
      if (!isAdmin) return false;
      if (!grant) return true;
      if (!grantActive) return false;
      return (grant.permissions?.[module] ?? []).includes(action);
    },
  };
}

/** Throws unless the caller currently holds `module.action`. */
export async function assertAdminCan(
  supabase: CallerClient,
  userId: string,
  module: AdminModule,
  action: AdminAction,
) {
  const authority = await resolveAdminAuthority(supabase, userId);
  if (authority.isProxyAdmin && !authority.grantActive) throw new Error(EXPIRED);
  if (!authority.can(module, action)) throw new Error(DENIED);
  return authority;
}

/** Throws unless the caller is a Super Admin. */
export async function assertSuperAdmin(supabase: CallerClient, userId: string) {
  const authority = await resolveAdminAuthority(supabase, userId);
  if (!authority.isSuperAdmin) throw new Error(DENIED);
  return authority;
}
