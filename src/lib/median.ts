/**
 * Median.co native-app integration helpers.
 *
 * KAIVRA runs both as a normal web app and, once wrapped by Median.co, as a
 * native Android / iOS shell. Every helper here is a no-op in a normal browser
 * so the same code path is safe everywhere — we never call a native bridge
 * that does not exist, and we never fake a native capability.
 *
 * Official detection method:
 *   const isMedianApp = navigator.userAgent.indexOf('median') > -1;
 */

type MedianBridge = Record<string, unknown> & {
  // Populated by the Median runtime inside the native shell.
  onReady?: (cb: () => void) => void;
};

declare global {
  interface Window {
    median?: MedianBridge;
    gonative?: MedianBridge;
    median_onesignal_push_opened?: unknown;
  }
}

/** True only inside the Median-wrapped native app. */
export function isMedianApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.toLowerCase().indexOf("median") > -1;
}

/** True when running on a phone-sized touch device (native or mobile web). */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** Returns the live Median bridge, or null in a browser. */
function bridge(): MedianBridge | null {
  if (typeof window === "undefined") return null;
  if (!isMedianApp()) return null;
  return window.median ?? window.gonative ?? null;
}

function call(path: string, args?: unknown) {
  const root = bridge();
  if (!root) return false;
  const parts = path.split(".");
  let node: unknown = root;
  for (const part of parts) {
    if (!node || typeof node !== "object") return false;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "function") return false;
  try {
    (node as (a?: unknown) => unknown)(args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Light haptic tap. Native only — silently ignored on the web, so it can be
 * called from any shared button handler.
 */
export function haptic(): void {
  call("haptics.impact", { style: "light" });
}

/** Native push registration prompt. Call after the user is signed in. */
export function requestPushPermission(): boolean {
  return call("onesignal.register");
}

/**
 * Tag the current signed-in user for push targeting. Safe no-op on the web.
 */
export function setPushExternalUserId(userId: string): boolean {
  return call("onesignal.externalUserId.set", { externalId: userId });
}

/** Clear push identity on sign-out. */
export function clearPushExternalUserId(): boolean {
  return call("onesignal.externalUserId.remove");
}

/**
 * Marks <html> so CSS can adapt (safe areas, no hover effects) and exposes the
 * flag for feature checks. Runs once on the client.
 */
export function initMedianRuntime(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (isMedianApp()) root.classList.add("median-app");
  if (isTouchDevice()) root.classList.add("touch-device");
}
