/**
 * Shared, browser-safe vocabulary for the KAIVRA digital footprint system.
 *
 * Nothing here is trusted: the browser proposes an event, the server verifies
 * the actor from the bearer token, derives country/IP-hash itself, and writes
 * the append-only row. Client code never touches the analytics tables.
 */

export const EVENT_CATEGORIES = [
  "visit",
  "auth",
  "profile",
  "investment",
  "support",
  "admin",
  "security",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const SEVERITIES = ["info", "warning", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RESULTS = ["success", "failure"] as const;
export type EventResult = (typeof RESULTS)[number];

/** Events the browser may propose. Everything else is written server-side. */
export const CLIENT_EVENT_TYPES = [
  "page_view",
  "session_start",
  "session_end",
  "sign_in",
  "sign_out",
  "sign_in_failed",
  "google_sign_in_attempt",
  "google_sign_in_failed",
  "password_reset_requested",
  "account_created",
  "profile_viewed",
  "profile_updated",
  "avatar_updated",
  "investment_viewed",
  "application_started",
  "application_submitted",
  "payment_receipt_submitted",
  "support_request_submitted",
  "complaint_submitted",
  "correction_request_submitted",
  "notification_viewed",
  "admin_module_opened",
  "admin_access_denied",
] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

const CLIENT_EVENT_SET = new Set<string>(CLIENT_EVENT_TYPES);
export const isClientEventType = (value: string) => CLIENT_EVENT_SET.has(value);

export const EVENT_META: Record<
  string,
  { label: string; category: EventCategory; severity?: Severity }
> = {
  page_view: { label: "Page viewed", category: "visit" },
  session_start: { label: "Session started", category: "visit" },
  session_end: { label: "Session ended", category: "visit" },
  sign_in: { label: "Signed in", category: "auth" },
  sign_out: { label: "Signed out", category: "auth" },
  sign_in_failed: { label: "Failed sign-in", category: "security", severity: "warning" },
  google_sign_in_attempt: { label: "Google sign-in attempt", category: "auth" },
  google_sign_in_failed: {
    label: "Google sign-in failed",
    category: "security",
    severity: "warning",
  },
  password_reset_requested: { label: "Password reset requested", category: "auth" },
  account_created: { label: "Account created", category: "auth" },
  profile_viewed: { label: "Profile viewed", category: "profile" },
  profile_updated: { label: "Profile updated", category: "profile" },
  avatar_updated: { label: "Avatar updated", category: "profile" },
  investment_viewed: { label: "Investment viewed", category: "investment" },
  application_started: { label: "Application started", category: "investment" },
  application_submitted: { label: "Application submitted", category: "investment" },
  payment_receipt_submitted: { label: "Payment receipt submitted", category: "investment" },
  support_request_submitted: { label: "Support request submitted", category: "support" },
  complaint_submitted: { label: "Complaint submitted", category: "support" },
  correction_request_submitted: { label: "Correction request submitted", category: "support" },
  notification_viewed: { label: "Notification viewed", category: "support" },
  admin_module_opened: { label: "Admin module opened", category: "admin" },
  admin_access_denied: { label: "Admin access denied", category: "security", severity: "high" },
};

export function eventLabel(type: string) {
  return EVENT_META[type]?.label ?? type.replace(/_/g, " ");
}

export function categoryFor(type: string): EventCategory {
  return EVENT_META[type]?.category ?? "visit";
}

export function severityFor(type: string, result: EventResult): Severity {
  const base = EVENT_META[type]?.severity;
  if (base) return base;
  return result === "failure" ? "warning" : "info";
}

export type DeviceInfo = {
  deviceCategory: "desktop" | "tablet" | "mobile";
  browser: string;
  os: string;
  screenClass: string;
  locale: string;
};

/** Coarse, non-fingerprinting classification from the user agent. */
export function describeDevice(ua: string, width?: number, locale?: string): DeviceInfo {
  const s = ua.toLowerCase();
  const tablet = /ipad|tablet|playbook|silk/.test(s) || (/android/.test(s) && !/mobile/.test(s));
  const mobile = !tablet && /mobi|iphone|ipod|android|blackberry|windows phone/.test(s);
  const browser = /edg\//.test(s)
    ? "Edge"
    : /opr\/|opera/.test(s)
      ? "Opera"
      : /chrome\//.test(s) && !/chromium/.test(s)
        ? "Chrome"
        : /firefox\//.test(s)
          ? "Firefox"
          : /safari\//.test(s)
            ? "Safari"
            : "Other";
  const os = /windows/.test(s)
    ? "Windows"
    : /iphone|ipad|ipod|ios/.test(s)
      ? "iOS"
      : /mac os x|macintosh/.test(s)
        ? "macOS"
        : /android/.test(s)
          ? "Android"
          : /linux/.test(s)
            ? "Linux"
            : "Other";
  const w = width ?? 0;
  const screenClass = w >= 1536 ? "xl" : w >= 1024 ? "lg" : w >= 768 ? "md" : w > 0 ? "sm" : "unknown";
  return {
    deviceCategory: tablet ? "tablet" : mobile ? "mobile" : "desktop",
    browser,
    os,
    screenClass,
    locale: locale ?? "unknown",
  };
}

export const DATE_RANGES = [
  { key: "today", label: "Today", days: 0 },
  { key: "yesterday", label: "Yesterday", days: 1 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "custom", label: "Custom range", days: -1 },
] as const;
export type DateRangeKey = (typeof DATE_RANGES)[number]["key"];

export function resolveRange(key: DateRangeKey, from?: string, to?: string) {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const startOf = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  if (key === "custom" && from && to) {
    return { from: new Date(`${from}T00:00:00`), to: new Date(`${to}T23:59:59`) };
  }
  if (key === "today") return { from: startOf(now), to: endOfToday };
  if (key === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const end = new Date(y);
    end.setHours(23, 59, 59, 999);
    return { from: startOf(y), to: end };
  }
  const days = DATE_RANGES.find((r) => r.key === key)?.days ?? 7;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { from: startOf(start), to: endOfToday };
}
