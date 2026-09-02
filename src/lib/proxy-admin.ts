import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/kaivra";

/**
 * Proxy Admin vocabulary shared by the Super Admin console and the admin shell.
 *
 * Authority model:
 *  - super_admin  : full authority, never expires, sole manager of proxy admins.
 *  - admin        : existing full administrator (no grant row) — unchanged.
 *  - proxy admin  : an `admin` role row PLUS a row in `proxy_admin_grants`.
 *                   Every privileged operation is re-checked in the database
 *                   through `private.admin_can()`, so an expired, suspended or
 *                   revoked grant loses access instantly, server-side.
 */

export const ADMIN_MODULES = [
  { key: "applications", label: "Applications", to: "/admin" },
  { key: "investors", label: "Investors", to: "/admin/investors" },
  { key: "transactions", label: "Transactions", to: "/admin/transactions" },
  { key: "payment_accounts", label: "Payment Accounts", to: "/admin/payment-accounts" },
  { key: "inspections", label: "Inspections", to: "/admin/inspections" },
  { key: "projects", label: "Projects", to: "/admin/projects" },
  { key: "advisers", label: "Advisers", to: "/admin/advisers" },
  { key: "support", label: "Support", to: "/admin/support" },
  { key: "corrections", label: "Corrections", to: "/admin/corrections" },
  { key: "enquiries", label: "Enquiries", to: "/admin/enquiries" },
  { key: "analytics", label: "Analytics", to: "/admin/analytics" },
] as const;

export type AdminModule = (typeof ADMIN_MODULES)[number]["key"];

export const ADMIN_ACTIONS = [
  "view",
  "create",
  "edit",
  "approve",
  "resolve",
  "export",
  "manage",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/** Actions that make sense per module (keeps the matrix honest). */
export const MODULE_ACTIONS: Record<AdminModule, AdminAction[]> = {
  applications: ["view", "create", "edit", "approve", "export"],
  investors: ["view", "create", "edit", "export"],
  transactions: ["view", "approve", "export"],
  payment_accounts: ["view", "create", "edit", "manage"],
  inspections: ["view", "edit", "manage"],
  projects: ["view", "manage"],
  advisers: ["view", "manage"],
  support: ["view", "resolve"],
  corrections: ["view", "resolve"],
  enquiries: ["view", "edit"],
  analytics: ["view", "export", "manage"],
};

export type PermissionMatrix = Partial<Record<AdminModule, AdminAction[]>>;

export type ProxyGrant = {
  id: string;
  user_id: string;
  permissions: PermissionMatrix;
  status: "active" | "suspended" | "revoked";
  starts_at: string;
  expires_at: string | null;
  note: string | null;
  granted_by: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GrantState = "active" | "scheduled" | "expired" | "revoked" | "suspended";

export function grantState(grant: Pick<ProxyGrant, "status" | "starts_at" | "expires_at">): GrantState {
  if (grant.status === "revoked") return "revoked";
  if (grant.status === "suspended") return "suspended";
  const now = Date.now();
  if (new Date(grant.starts_at).getTime() > now) return "scheduled";
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= now) return "expired";
  return "active";
}

export function timeRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "No expiry";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

export const DURATION_PRESETS = [
  { label: "1 hour", hours: 1 },
  { label: "4 hours", hours: 4 },
  { label: "8 hours", hours: 8 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
] as const;

export const RESTRICTED_MESSAGE =
  "Access restricted. This is a KAIVRA Super Admin function. Contact a Super Admin if you require access.";

export const EXPIRED_MESSAGE =
  "Your KAIVRA Proxy Admin access has expired. Please contact a Super Admin if you require further access.";

/**
 * Reads the caller's own grant row (RLS: a user can only ever see their own).
 * The result is advisory for the UI — the database re-checks every operation.
 */
export function useMyProxyGrant(userId?: string) {
  return useQuery({
    queryKey: ["proxy-grant", userId],
    enabled: !!userId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ProxyGrant | null> => {
      const { data, error } = await supabase
        .from("proxy_admin_grants")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as ProxyGrant | null) ?? null;
    },
  });
}

export type AdminAccess = {
  role: AppRole;
  isSuperAdmin: boolean;
  isProxyAdmin: boolean;
  /** Proxy grant is present but not currently usable. */
  accessExpired: boolean;
  grant: ProxyGrant | null;
  can: (module: AdminModule, action: AdminAction) => boolean;
  modules: AdminModule[];
};

export function buildAdminAccess(role: AppRole, grant: ProxyGrant | null): AdminAccess {
  const isSuperAdmin = role === "super_admin";
  const isProxyAdmin = !!grant;
  const state = grant ? grantState(grant) : null;
  const usable = !grant || state === "active";
  const can = (module: AdminModule, action: AdminAction) => {
    if (isSuperAdmin) return true;
    if (role !== "admin") return false;
    if (!grant) return true;
    if (state !== "active") return false;
    return (grant.permissions?.[module] ?? []).includes(action);
  };
  return {
    role,
    isSuperAdmin,
    isProxyAdmin,
    accessExpired: isProxyAdmin && !usable,
    grant,
    can,
    modules: ADMIN_MODULES.map((m) => m.key).filter((m) => can(m, "view")),
  };
}

/**
 * Analytics is a Super Admin function. Unlike the other modules, an ordinary
 * administrator is NOT implicitly allowed: a Super Admin must explicitly grant
 * `analytics` on their proxy grant. The server re-checks this on every read.
 */
export function canAnalytics(access: AdminAccess, action: AdminAction = "view") {
  if (access.isSuperAdmin) return true;
  const grant = access.grant;
  if (!grant || grantState(grant) !== "active") return false;
  return (grant.permissions?.analytics ?? []).includes(action);
}
