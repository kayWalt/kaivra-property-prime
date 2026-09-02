/**
 * Server-side ingestion for the KAIVRA digital footprint system.
 *
 * The analytics tables are unreachable from the browser (no grants, RLS on with
 * no policies). Everything is written here with the service-role client after
 * the request has been verified and stripped of personally identifying data:
 * raw IP addresses are never stored, only a salted one-way hash used for
 * repeat-visit and brute-force detection.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  categoryFor,
  describeDevice,
  severityFor,
  type EventResult,
} from "@/lib/analytics";

function salt() {
  return (
    process.env["ANALYTICS_IP_SALT"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    "kaivra-local-salt"
  );
}

export function hashIp(ip: string | null) {
  if (!ip) return null;
  return createHash("sha256").update(`${salt()}:${ip}`).digest("hex").slice(0, 40);
}

export function requestNetworkMeta(headers: Headers) {
  const ip =
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  return {
    ipHash: hashIp(ip),
    userAgent: headers.get("user-agent") ?? "",
    country: headers.get("cf-ipcountry") || null,
    region: headers.get("cf-region") || null,
  };
}

/** Resolves the caller identity from the bearer token; never from the body. */
export async function verifiedUserId(headers: Headers): Promise<string | null> {
  const auth = headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  if (token.split(".").length !== 3) return null;
  const url = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  try {
    const client = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return data.claims.sub as string;
  } catch {
    return null;
  }
}

export type IngestPayload = {
  eventType: string;
  sessionId: string;
  visitorId: string;
  route?: string | null;
  referrer?: string | null;
  locale?: string | null;
  screenWidth?: number | null;
  isReturning?: boolean;
  result?: EventResult;
  metadata?: Record<string, unknown>;
};

async function actorLabel(userId: string | null) {
  if (!userId) return { label: null as string | null, role: "visitor" };
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabaseAdmin.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const list = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  const role = list.includes("super_admin")
    ? "super_admin"
    : list.includes("admin")
      ? "admin"
      : list.includes("adviser")
        ? "adviser"
        : "investor";
  const p = profile as { full_name: string | null; email: string | null } | null;
  return { label: p?.full_name ?? p?.email ?? null, role };
}

/**
 * Records one event and keeps the rolled-up visitor session in step.
 * Best effort: analytics must never break a user journey.
 */
export async function ingestEvent(
  payload: IngestPayload,
  headers: Headers,
  userIdOverride?: string | null,
) {
  const net = requestNetworkMeta(headers);
  const userId =
    userIdOverride !== undefined ? userIdOverride : await verifiedUserId(headers);
  const device = describeDevice(
    net.userAgent,
    payload.screenWidth ?? undefined,
    payload.locale ?? undefined,
  );
  const result: EventResult = payload.result ?? "success";
  const now = new Date().toISOString();
  const identity = await actorLabel(userId);

  const { data: existing } = await supabaseAdmin
    .from("visitor_sessions")
    .select("id, page_views")
    .eq("session_id", payload.sessionId)
    .maybeSingle();

  const isPageView = payload.eventType === "page_view";
  const base = {
    session_id: payload.sessionId,
    visitor_id: payload.visitorId,
    user_id: userId,
    is_authenticated: !!userId,
    last_seen_at: now,
    exit_page: payload.route ?? null,
    device_category: device.deviceCategory,
    browser: device.browser,
    os: device.os,
    screen_class: device.screenClass,
    country: net.country,
    region: net.region,
    locale: payload.locale ?? null,
    ip_hash: net.ipHash,
  };

  if (!existing) {
    await supabaseAdmin.from("visitor_sessions").insert({
      ...base,
      is_returning: !!payload.isReturning,
      started_at: now,
      entry_page: payload.route ?? null,
      referrer: payload.referrer ?? null,
      page_views: isPageView ? 1 : 0,
    } as never);
  } else {
    const row = existing as { id: string; page_views: number };
    await supabaseAdmin
      .from("visitor_sessions")
      .update({
        ...base,
        page_views: row.page_views + (isPageView ? 1 : 0),
        ...(payload.eventType === "session_end" ? { ended_at: now } : {}),
      } as never)
      .eq("id", row.id);
  }

  const { error } = await supabaseAdmin.from("activity_events").insert({
    occurred_at: now,
    actor: userId,
    actor_role: identity.role,
    actor_label: identity.label,
    event_type: payload.eventType,
    event_category: categoryFor(payload.eventType),
    severity: severityFor(payload.eventType, result),
    result,
    route: payload.route ?? null,
    session_id: payload.sessionId,
    visitor_id: payload.visitorId,
    device_category: device.deviceCategory,
    browser: device.browser,
    os: device.os,
    country: net.country,
    locale: payload.locale ?? null,
    metadata: (payload.metadata ?? {}) as never,
  } as never);
  if (error) console.error("[analytics] event insert failed", error.message);
}
