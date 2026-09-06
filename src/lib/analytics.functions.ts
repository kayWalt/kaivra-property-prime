import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  directorySchema,
  filterSchema,
  footprintSchema,
  rangeSchema,
  retentionSchema,
  type AnalyticsOp,
} from "@/lib/analytics-schemas";

/**
 * Read side of the digital footprint system.
 *
 * Authority is re-derived on every call from the caller's own RLS-scoped
 * client. Analytics is STRICTLY a Super Admin function: ordinary admins and
 * proxy admins are denied on every read, export and settings call.
 *
 * Execution: the privileged reads run in whichever environment holds
 * SUPABASE_SERVICE_ROLE_KEY. On the Cloudflare-hosted production frontend that
 * key intentionally does not exist, so the call is relayed to the Lovable Cloud
 * backend with the caller's own bearer token (authorisation is re-checked
 * there). In Lovable Cloud the existing direct behaviour is preserved.
 */

const RESTRICTED = "Access restricted. Visitor analytics is a KAIVRA Super Admin function.";
const UNAVAILABLE = "Analytics data could not be loaded.";

type Caller = { supabase: any; userId: string };

async function requireAnalytics(context: Caller, _action: "view" | "export" | "manage" = "view") {
  const { data: roleRows, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(RESTRICTED);
  const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
  // Strictly Super Admin: no grant, payload, header or role claim can widen it.
  if (!roles.includes("super_admin")) throw new Error(RESTRICTED);
  return { isSuperAdmin: true };
}

/** True when this deployment can run the privileged analytics reads itself. */
function hasPrivilegedAccess() {
  return Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

/**
 * Runs the privileged read locally when possible, otherwise through the
 * Lovable Cloud relay. A relay failure throws, so the page shows a clear
 * "could not be loaded" state rather than silent zeroes.
 */
async function run<T>(op: AnalyticsOp, data: unknown, local: () => Promise<T>): Promise<T> {
  if (hasPrivilegedAccess()) return local();
  const { relayAnalytics } = await import("@/lib/analytics-relay.server");
  const relayed = await relayAnalytics<T>(op, data);
  if (relayed === null) throw new Error(UNAVAILABLE);
  return relayed;
}

export const analyticsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAnalytics(context as Caller);
    return run("overview", data, async () => {
      const { overviewCore } = await import("@/lib/analytics-core.server");
      return overviewCore(data);
    });
  });

export const activityFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await requireAnalytics(context as Caller);
    return run("activityFeed", data, async () => {
      const { activityFeedCore } = await import("@/lib/analytics-core.server");
      return activityFeedCore(data, isSuperAdmin);
    });
  });

/**
 * Every person (identified user or anonymous visitor) seen in the window, with
 * the pages they visited. Super Admin only, like every other analytics read.
 */
export const visitorDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => directorySchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAnalytics(context as Caller);
    return run("visitorDirectory", data, async () => {
      const { visitorDirectoryCore } = await import("@/lib/analytics-core.server");
      return visitorDirectoryCore(data);
    });
  });

export const userFootprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => footprintSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAnalytics(context as Caller);
    return run("userFootprint", data, async () => {
      const { userFootprintCore } = await import("@/lib/analytics-core.server");
      return userFootprintCore(data);
    });
  });

export const securitySignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAnalytics(context as Caller);
    return run("securitySignals", data, async () => {
      const { securitySignalsCore } = await import("@/lib/analytics-core.server");
      return securitySignalsCore(data);
    });
  });

export const exportActivityCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAnalytics(context as Caller, "export");
    return run("exportCsv", data, async () => {
      const { exportCsvCore } = await import("@/lib/analytics-core.server");
      return exportCsvCore(data);
    });
  });

export const analyticsRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => retentionSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await requireAnalytics(context as Caller, "manage");
    return run("retention", data, async () => {
      const { retentionCore } = await import("@/lib/analytics-core.server");
      return retentionCore(data, (context as Caller).userId, isSuperAdmin);
    });
  });
