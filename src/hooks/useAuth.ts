import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/kaivra";

/**
 * Single app-wide session store: one getSession() call and one auth listener,
 * shared by every component through useSyncExternalStore.
 */
type SessionState = { session: Session | null; loading: boolean };

let state: SessionState = { session: null, loading: true };
const listeners = new Set<() => void>();
let started = false;
let lastEvent: { event: string; userId: string | undefined } | null = null;

function emit(next: SessionState) {
  if (next.session === state.session && next.loading === state.loading) return;
  state = next;
  listeners.forEach((l) => l());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  supabase.auth.onAuthStateChange((event, next) => {
    lastEvent = { event, userId: next?.user?.id };
    emit({ session: next, loading: false });
  });
  void supabase.auth.getSession().then(({ data }) => {
    emit({ session: data.session, loading: false });
  });
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverSnapshot: SessionState = { session: null, loading: true };

export function useSession() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => serverSnapshot,
  );
  const queryClient = useQueryClient();
  const userId = snapshot.session?.user?.id;

  // Identity transitions invalidate cached user-scoped data exactly once.
  useEffect(() => {
    if (!lastEvent) return;
    const { event } = lastEvent;
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    queryClient.invalidateQueries({ queryKey: ["roles"] });
  }, [queryClient, userId]);

  return {
    session: snapshot.session,
    user: snapshot.session?.user ?? null,
    loading: snapshot.loading,
  };
}

/** Session snapshot without subscribing (used by fast redirect checks). */
export function peekSession() {
  start();
  return state;
}

export function useRoles(userId?: string) {
  return useQuery({
    queryKey: ["roles", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, avatar_url, investor_code")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function primaryRole(roles: AppRole[] | undefined): AppRole {
  if (!roles || roles.length === 0) return "investor";
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("adviser")) return "adviser";
  return "investor";
}

export function isStaffRole(role: AppRole) {
  return role === "admin" || role === "super_admin" || role === "adviser";
}
