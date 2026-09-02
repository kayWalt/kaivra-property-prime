/**
 * Browser-side sender for the KAIVRA digital footprint.
 *
 * Stores only a random, rotating visitor id in localStorage (no third-party
 * cookies, no fingerprinting) and posts to the public collector, which does the
 * classification server-side. All failures are swallowed: analytics must never
 * affect a user journey.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ClientEventType } from "@/lib/analytics";

const VISITOR_KEY = "kaivra.visitor";
const SESSION_KEY = "kaivra.session";
const CONSENT_KEY = "kaivra.analytics.consent";

function randomId() {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function analyticsEnabled() {
  if (typeof window === "undefined") return false;
  // Respect an explicit opt-out and Do Not Track.
  if (window.localStorage.getItem(CONSENT_KEY) === "off") return false;
  if (navigator.doNotTrack === "1") return false;
  return true;
}

export function setAnalyticsConsent(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_KEY, enabled ? "on" : "off");
}

function ids() {
  let visitorId = window.localStorage.getItem(VISITOR_KEY);
  const isReturning = !!visitorId;
  if (!visitorId) {
    visitorId = randomId();
    window.localStorage.setItem(VISITOR_KEY, visitorId);
  }
  let sessionId = window.sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = randomId();
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return { visitorId, sessionId, isReturning };
}

export async function trackEvent(
  eventType: ClientEventType,
  options: {
    route?: string;
    result?: "success" | "failure";
    metadata?: Record<string, string | number | boolean>;
  } = {},
) {
  if (!analyticsEnabled()) return;
  try {
    const { visitorId, sessionId, isReturning } = ids();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    await fetch("/api/public/track", {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        eventType,
        sessionId,
        visitorId,
        isReturning,
        route: options.route ?? window.location.pathname,
        referrer: document.referrer || undefined,
        locale: navigator.language,
        screenWidth: window.innerWidth,
        result: options.result,
        metadata: options.metadata,
      }),
    });
  } catch {
    /* analytics is best effort */
  }
}
