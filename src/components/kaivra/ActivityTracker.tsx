import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSession } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/track";

/**
 * Mounted once in the root layout. Records page views, session start/end and
 * sign-in / sign-out transitions. It never sends identity: the collector
 * resolves the actor from the verified bearer token.
 */
export function ActivityTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading } = useSession();
  const started = useRef(false);
  const lastPath = useRef<string | null>(null);
  const lastUser = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void trackEvent("session_start");
    const end = () => void trackEvent("session_end");
    window.addEventListener("pagehide", end);
    return () => window.removeEventListener("pagehide", end);
  }, []);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const timer = window.setTimeout(() => void trackEvent("page_view", { route: pathname }), 400);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (loading) return;
    const current = user?.id ?? null;
    if (lastUser.current === undefined) {
      lastUser.current = current;
      return;
    }
    if (lastUser.current === current) return;
    void trackEvent(current ? "sign_in" : "sign_out", { route: pathname });
    lastUser.current = current;
  }, [user?.id, loading, pathname]);

  return null;
}
