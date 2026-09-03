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

/**
 * Every person (identified user or anonymous visitor) seen in the window, with
 * the pages they visited. Super Admin only, like every other analytics read.
 */
export const visitorDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    rangeSchema
      .extend({
        search: z.string().trim().max(80).optional(),
        onlySignedIn: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAnalytics(context as Caller);
    const { fromIso, toIso } = window(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: sessionRows }, { data: eventRows }] = await Promise.all([
      supabaseAdmin
        .from("visitor_sessions")
        .select(
          "session_id, visitor_id, user_id, is_authenticated, is_returning, started_at, last_seen_at, page_views, entry_page, exit_page, referrer, device_category, browser, os, country, region, locale",
        )
        .gte("started_at", fromIso)
        .lte("started_at", toIso)
        .order("started_at", { ascending: false })
        .limit(20_000),
      supabaseAdmin
        .from("activity_events")
        .select("visitor_id, actor, route, event_type, occurred_at, result")
        .gte("occurred_at", fromIso)
        .lte("occurred_at", toIso)
        .order("occurred_at", { ascending: false })
        .limit(20_000),
    ]);

    const sessions = (sessionRows ?? []) as any[];
    const events = (eventRows ?? []) as any[];

    type Person = {
      visitorId: string;
      userId: string | null;
      name: string | null;
      email: string | null;
      phone: string | null;
      investorCode: string | null;
      role: string;
      sessions: number;
      pageViews: number;
      firstSeen: string;
      lastSeen: string;
      device: string | null;
      browser: string | null;
      os: string | null;
      country: string | null;
      locale: string | null;
      referrer: string | null;
      entryPage: string | null;
      isReturning: boolean;
      lastSignInEvent: string | null;
      failedSignIns: number;
      pages: { route: string; views: number; lastAt: string }[];
    };

    // Resolve device identity: a person who signs in at any point owns every
    // session recorded from that device, so their earlier "anonymous" visits
    // are folded into the named person instead of appearing separately.
    const identity = new Map<string, string>(); // visitor_id -> user_id
    for (const s of sessions) if (s.visitor_id && s.user_id) identity.set(s.visitor_id, s.user_id);
    for (const e of events) if (e.visitor_id && e.actor) identity.set(e.visitor_id, e.actor);
    const visitorIds = [
      ...new Set([
        ...sessions.map((s) => s.visitor_id),
        ...events.map((e) => e.visitor_id),
      ].filter(Boolean)),
    ] as string[];
    const unknown = visitorIds.filter((v) => !identity.has(v));
    if (unknown.length) {
      const { data: linked } = await supabaseAdmin
        .from("visitor_sessions")
        .select("visitor_id, user_id")
        .not("user_id", "is", null)
        .in("visitor_id", unknown.slice(0, 500))
        .limit(2_000);
      for (const row of ((linked ?? []) as any[])) {
        if (row.visitor_id && row.user_id) identity.set(row.visitor_id, row.user_id);
      }
    }
    const keyFor = (visitorId?: string | null, userId?: string | null) =>
      userId ?? (visitorId ? (identity.get(visitorId) ?? visitorId) : null);

    const people = new Map<string, Person>();
    for (const s of sessions) {
      const key = keyFor(s.visitor_id, s.user_id);
      if (!key) continue;
      const resolvedUser = s.user_id ?? identity.get(s.visitor_id) ?? null;
      const p = people.get(key);
      if (!p) {
        people.set(key, {
          visitorId: s.visitor_id,
          userId: resolvedUser,
          name: null,
          email: null,
          phone: null,
          investorCode: null,
          role: resolvedUser ? "user" : "visitor",
          sessions: 1,
          pageViews: s.page_views ?? 0,
          firstSeen: s.started_at,
          lastSeen: s.last_seen_at,
          device: s.device_category,
          browser: s.browser,
          os: s.os,
          country: s.country,
          locale: s.locale,
          referrer: s.referrer,
          entryPage: s.entry_page,
          isReturning: !!s.is_returning,
          lastSignInEvent: null,
          failedSignIns: 0,
          pages: [],
        });
      } else {
        p.sessions += 1;
        p.pageViews += s.page_views ?? 0;
        p.userId = p.userId ?? resolvedUser;
        if (s.started_at < p.firstSeen) p.firstSeen = s.started_at;
        if (s.last_seen_at > p.lastSeen) p.lastSeen = s.last_seen_at;
        p.device = p.device ?? s.device_category;
        p.browser = p.browser ?? s.browser;
        p.os = p.os ?? s.os;
        p.country = p.country ?? s.country;
        p.locale = p.locale ?? s.locale;
        p.referrer = p.referrer ?? s.referrer;
        p.entryPage = p.entryPage ?? s.entry_page;
        p.isReturning = p.isReturning || !!s.is_returning;
      }
    }

    // Pages + sign-in signals per person.
    const pageMap = new Map<string, Map<string, { views: number; lastAt: string }>>();
    for (const e of events) {
      const key = keyFor(e.visitor_id, e.actor);
      if (!key) continue;
      const resolvedUser = e.actor ?? (e.visitor_id ? identity.get(e.visitor_id) ?? null : null);
      let person = people.get(key);
      if (!person) {
        person = {
          visitorId: e.visitor_id ?? key,
          userId: resolvedUser,
          name: null,
          email: null,
          phone: null,
          investorCode: null,
          role: resolvedUser ? "user" : "visitor",
          sessions: 0,
          pageViews: 0,
          firstSeen: e.occurred_at,
          lastSeen: e.occurred_at,
          device: null,
          browser: null,
          os: null,
          country: null,
          locale: null,
          referrer: null,
          entryPage: null,
          isReturning: false,
          lastSignInEvent: null,
          failedSignIns: 0,
          pages: [],
        };
        people.set(key, person);
      }
      person.userId = person.userId ?? resolvedUser;
      if (e.occurred_at > person.lastSeen) person.lastSeen = e.occurred_at;
      if (e.occurred_at < person.firstSeen) person.firstSeen = e.occurred_at;
      if (e.event_type === "sign_in" && (!person.lastSignInEvent || e.occurred_at > person.lastSignInEvent)) {
        person.lastSignInEvent = e.occurred_at;
      }
      if (e.event_type === "sign_in_failed" || e.event_type === "google_sign_in_failed") {
        person.failedSignIns += 1;
      }
      if (e.event_type === "page_view" && e.route) {
        const routes = pageMap.get(key) ?? new Map();
        const entry = routes.get(e.route) ?? { views: 0, lastAt: e.occurred_at };
        entry.views += 1;
        if (e.occurred_at > entry.lastAt) entry.lastAt = e.occurred_at;
        routes.set(e.route, entry);
        pageMap.set(key, routes);
      }
    }
    for (const [key, routes] of pageMap) {
      const person = people.get(key);
      if (!person) continue;
      person.pages = [...routes.entries()]
        .map(([route, v]) => ({ route, views: v.views, lastAt: v.lastAt }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 50);
      // Session counters can lag behind the event stream; never under-report.
      const viewed = person.pages.reduce((a, b) => a + b.views, 0);
      if (viewed > person.pageViews) person.pageViews = viewed;
    }


    // Identity for signed-in people.
    const userIds = [...new Set([...people.values()].map((p) => p.userId).filter(Boolean))] as string[];
    if (userIds.length) {
      const [{ data: profiles }, { data: roleRows }] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, phone, investor_code")
          .in("id", userIds),
        supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds),
      ]);
      const roleFor = new Map<string, string[]>();
      for (const r of ((roleRows ?? []) as any[])) {
        roleFor.set(r.user_id, [...(roleFor.get(r.user_id) ?? []), r.role]);
      }
      const profileFor = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));
      for (const person of people.values()) {
        if (!person.userId) continue;
        const prof = profileFor.get(person.userId);
        if (prof) {
          person.name = prof.full_name ?? null;
          person.email = prof.email ?? null;
          person.phone = prof.phone ?? null;
          person.investorCode = prof.investor_code ?? null;
        }
        const list = roleFor.get(person.userId) ?? [];
        person.role = list.includes("super_admin")
          ? "super_admin"
          : list.includes("admin")
            ? "admin"
            : list.includes("adviser")
              ? "adviser"
              : "investor";
      }
    }

    let rows = [...people.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    if (data.onlySignedIn) rows = rows.filter((r) => r.userId);
    if (data.search) {
      const q = data.search.toLowerCase();
      rows = rows.filter((r) =>
        [r.name, r.email, r.phone, r.investorCode, r.visitorId, r.country]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return { people: rows.slice(0, 300), total: rows.length };
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
        .select("id, full_name, email, phone, investor_code, created_at")
        .eq("id", data.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("activity_events")
        .select("id, occurred_at, event_type, event_category, severity, result, route, device_category, browser, os, country")
        .eq("actor", data.userId)
        .order("occurred_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("visitor_sessions")
        .select("session_id, started_at, last_seen_at, page_views, entry_page, exit_page, referrer, device_category, browser, os, country")
        .eq("user_id", data.userId)
        .order("started_at", { ascending: false })
        .limit(25),
    ]);

    // Login details straight from the auth records (server-side only).
    let login: {
      email: string | null;
      lastSignInAt: string | null;
      createdAt: string | null;
      emailConfirmedAt: string | null;
      providers: string[];
    } | null = null;
    try {
      const { data: au } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      if (au?.user) {
        login = {
          email: au.user.email ?? null,
          lastSignInAt: au.user.last_sign_in_at ?? null,
          createdAt: au.user.created_at ?? null,
          emailConfirmedAt: (au.user as any).email_confirmed_at ?? null,
          providers: ((au.user.app_metadata as any)?.providers ?? []) as string[],
        };
      }
    } catch {
      login = null;
    }

    const pageCounts = new Map<string, { views: number; lastAt: string }>();
    for (const e of ((events ?? []) as any[])) {
      if (e.event_type !== "page_view" || !e.route) continue;
      const entry = pageCounts.get(e.route) ?? { views: 0, lastAt: e.occurred_at };
      entry.views += 1;
      if (e.occurred_at > entry.lastAt) entry.lastAt = e.occurred_at;
      pageCounts.set(e.route, entry);
    }

    return {
      profile: profile ?? null,
      login,
      pages: [...pageCounts.entries()]
        .map(([route, v]) => ({ route, views: v.views, lastAt: v.lastAt }))
        .sort((a, b) => b.views - a.views),
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
