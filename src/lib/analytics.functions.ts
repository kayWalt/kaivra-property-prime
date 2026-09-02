import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveRange, type DateRangeKey } from "@/lib/analytics";

/**
 * Read side of the digital footprint system.
 *
 * Authority is re-derived on every call from the caller's own RLS-scoped
 * client. Analytics is STRICTLY a Super Admin function: ordinary admins and
 * proxy admins are denied on every read, export and settings call.
 */

const RESTRICTED = "Access restricted. Visitor analytics is a KAIVRA Super Admin function.";

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

const rangeSchema = z.object({
  rangeKey: z
    .enum(["today", "yesterday", "7d", "30d", "90d", "custom"])
    .default("7d"),
  from: z.string().optional(),
  to: z.string().optional(),
});

const filterSchema = rangeSchema.extend({
  category: z.string().max(30).optional(),
  severity: z.string().max(20).optional(),
  result: z.enum(["success", "failure"]).optional(),
  role: z.string().max(20).optional(),
  search: z.string().trim().max(80).optional(),
  actor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).max(10_000).default(0),
});

function window(input: z.infer<typeof rangeSchema>) {
  const { from, to } = resolveRange(input.rangeKey as DateRangeKey, input.from, input.to);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

function tally<T extends string>(values: (T | null | undefined)[], top = 8) {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = v && v.length ? v : "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}

export const analyticsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAnalytics(context as Caller);
    const { fromIso, toIso } = window(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: sessions }, { data: events }] = await Promise.all([
      supabaseAdmin
        .from("visitor_sessions")
        .select(
          "session_id, visitor_id, user_id, is_authenticated, is_returning, started_at, last_seen_at, page_views, entry_page, referrer, device_category, browser, os, country",
        )
        .gte("started_at", fromIso)
        .lte("started_at", toIso)
        .order("started_at", { ascending: false })
        .limit(20_000),
      supabaseAdmin
        .from("activity_events")
        .select("event_type, event_category, severity, result, route, occurred_at, actor")
        .gte("occurred_at", fromIso)
        .lte("occurred_at", toIso)
        .order("occurred_at", { ascending: false })
        .limit(20_000),
    ]);

    const s = (sessions ?? []) as any[];
    const e = (events ?? []) as any[];

    const byDay = new Map<string, { day: string; sessions: number; visitors: Set<string>; events: number }>();
    for (const row of s) {
      const day = row.started_at.slice(0, 10);
      const bucket = byDay.get(day) ?? { day, sessions: 0, visitors: new Set<string>(), events: 0 };
      bucket.sessions += 1;
      bucket.visitors.add(row.visitor_id);
      byDay.set(day, bucket);
    }
    for (const row of e) {
      const day = row.occurred_at.slice(0, 10);
      const bucket = byDay.get(day) ?? { day, sessions: 0, visitors: new Set<string>(), events: 0 };
      bucket.events += 1;
      byDay.set(day, bucket);
    }
    const timeseries = [...byDay.values()]
      .map((b) => ({ day: b.day, sessions: b.sessions, visitors: b.visitors.size, events: b.events }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const durations = s.map((r) =>
      Math.max(0, (new Date(r.last_seen_at).getTime() - new Date(r.started_at).getTime()) / 1000),
    );
    const avgDuration = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
    const bounced = s.filter((r) => (r.page_views ?? 0) <= 1).length;

    return {
      totals: {
        sessions: s.length,
        visitors: new Set(s.map((r) => r.visitor_id)).size,
        signedIn: new Set(s.filter((r) => r.user_id).map((r) => r.user_id)).size,
        pageViews: s.reduce((a, r) => a + (r.page_views ?? 0), 0),
        events: e.length,
        avgDurationSeconds: avgDuration,
        bounceRate: s.length ? Math.round((bounced / s.length) * 100) : 0,
        returningRate: s.length
          ? Math.round((s.filter((r) => r.is_returning).length / s.length) * 100)
          : 0,
        failures: e.filter((r) => r.result === "failure").length,
        securityEvents: e.filter((r) => r.event_category === "security").length,
      },
      timeseries,
      topPages: tally(e.filter((r) => r.event_type === "page_view").map((r) => r.route), 10),
      entryPages: tally(s.map((r) => r.entry_page), 6),
      referrers: tally(
        s.map((r) => {
          if (!r.referrer) return "Direct";
          try {
            return new URL(r.referrer).hostname;
          } catch {
            return "Direct";
          }
        }),
        6,
      ),
      devices: tally(s.map((r) => r.device_category), 5),
      browsers: tally(s.map((r) => r.browser), 6),
      operatingSystems: tally(s.map((r) => r.os), 6),
      countries: tally(s.map((r) => r.country), 8),
      categories: tally(e.map((r) => r.event_category), 8),
      topEvents: tally(e.map((r) => r.event_type), 10),
      authSplit: [
        { name: "Signed in", value: s.filter((r) => r.is_authenticated).length },
        { name: "Anonymous", value: s.filter((r) => !r.is_authenticated).length },
      ],
    };
  });

export const activityFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await requireAnalytics(context as Caller);
    const { fromIso, toIso } = window(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("activity_events")
      .select(
        "id, occurred_at, actor, actor_role, actor_label, event_type, event_category, severity, result, route, device_category, browser, os, country, metadata",
        { count: "exact" },
      )
      .gte("occurred_at", fromIso)
      .lte("occurred_at", toIso)
      .order("occurred_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.category) query = query.eq("event_category", data.category);
    if (data.severity) query = query.eq("severity", data.severity);
    if (data.result) query = query.eq("result", data.result);
    if (data.role) query = query.eq("actor_role", data.role);
    if (data.actor) query = query.eq("actor", data.actor);
    if (data.search) {
      const term = `%${data.search.replace(/[%,]/g, "")}%`;
      query = query.or(`actor_label.ilike.${term},event_type.ilike.${term},route.ilike.${term}`);
    }

    const { data: rows, count, error } = await query;
    if (error) throw new Error("Activity could not be loaded.");

    const items = ((rows ?? []) as any[]).map((r) => ({
      ...r,
      // Proxy admins never see identity-level detail.
      actor_label: isSuperAdmin ? r.actor_label : r.actor_label ? "Redacted" : null,
      actor: isSuperAdmin ? r.actor : null,
    }));
    return { items, total: count ?? items.length };
  });

export const userFootprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAnalytics(context as Caller);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profile }, { data: events }, { data: sessions }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, investor_code, created_at")
        .eq("id", data.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("activity_events")
        .select("id, occurred_at, event_type, event_category, severity, result, route, device_category, country")
        .eq("actor", data.userId)
        .order("occurred_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("visitor_sessions")
        .select("session_id, started_at, last_seen_at, page_views, device_category, browser, os, country")
        .eq("user_id", data.userId)
        .order("started_at", { ascending: false })
        .limit(25),
    ]);
    return {
      profile: profile ?? null,
      events: (events ?? []) as any[],
      sessions: (sessions ?? []) as any[],
    };
  });

export const securitySignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAnalytics(context as Caller);
    const { fromIso, toIso } = window(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: events }, { data: audits }] = await Promise.all([
      supabaseAdmin
        .from("activity_events")
        .select("id, occurred_at, event_type, actor_label, actor_role, severity, result, route, country, visitor_id")
        .in("severity", ["warning", "high", "critical"])
        .gte("occurred_at", fromIso)
        .lte("occurred_at", toIso)
        .order("occurred_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("admin_audit_events")
        .select("id, created_at, action, actor_name, actor_role, detail")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    const list = (events ?? []) as any[];
    const failedByVisitor = tally(
      list.filter((r) => r.result === "failure").map((r) => r.visitor_id),
      6,
    );
    return {
      events: list,
      adminEvents: (audits ?? []) as any[],
      repeatedFailures: failedByVisitor.filter((r) => r.value >= 3),
    };
  });

export const exportActivityCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAnalytics(context as Caller, "export");
    const { fromIso, toIso } = window(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("activity_events")
      .select(
        "occurred_at, actor_role, actor_label, event_type, event_category, severity, result, route, device_category, browser, os, country",
      )
      .gte("occurred_at", fromIso)
      .lte("occurred_at", toIso)
      .order("occurred_at", { ascending: false })
      .limit(5000);
    if (data.category) query = query.eq("event_category", data.category);
    if (data.severity) query = query.eq("severity", data.severity);
    if (data.result) query = query.eq("result", data.result);
    if (data.role) query = query.eq("actor_role", data.role);
    const { data: rows } = await query;
    const cols = [
      "occurred_at",
      "actor_role",
      "actor_label",
      "event_type",
      "event_category",
      "severity",
      "result",
      "route",
      "device_category",
      "browser",
      "os",
      "country",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      cols.join(","),
      ...((rows ?? []) as any[]).map((r) => cols.map((c) => esc(r[c])).join(",")),
    ].join("\n");
    return { csv, rows: (rows ?? []).length };
  });

export const analyticsRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        visitorRetentionDays: z.number().int().min(7).max(3650).optional(),
        activityRetentionDays: z.number().int().min(30).max(3650).optional(),
        purge: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await requireAnalytics(context as Caller, "manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (isSuperAdmin && (data.visitorRetentionDays || data.activityRetentionDays)) {
      await supabaseAdmin
        .from("analytics_settings")
        .update({
          ...(data.visitorRetentionDays ? { visitor_retention_days: data.visitorRetentionDays } : {}),
          ...(data.activityRetentionDays
            ? { activity_retention_days: data.activityRetentionDays }
            : {}),
          updated_by: context.userId,
        } as never)
        .eq("id", true);
    }

    const { data: settings } = await supabaseAdmin
      .from("analytics_settings")
      .select("visitor_retention_days, activity_retention_days, security_retention_days, updated_at")
      .eq("id", true)
      .maybeSingle();

    let purged = 0;
    if (data.purge && isSuperAdmin && settings) {
      const s = settings as any;
      const cutoff = (days: number) =>
        new Date(Date.now() - days * 86_400_000).toISOString();
      const { count } = await supabaseAdmin
        .from("visitor_sessions")
        .delete({ count: "exact" })
        .lt("started_at", cutoff(s.visitor_retention_days));
      purged = count ?? 0;
    }

    return { settings: settings ?? null, purged, canManage: isSuperAdmin };
  });
