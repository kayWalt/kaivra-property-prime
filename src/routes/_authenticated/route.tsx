import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/kaivra/AppShell";
import { peekSession } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Fast path: the app-wide session store already holds a valid session, so
    // in-app navigation never pays for a network auth round trip.
    const cached = peekSession();
    if (cached.session?.user) return { user: cached.session.user };
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
