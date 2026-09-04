import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, LogOut, Menu, User } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "./Brand";
import { Button } from "@/components/ui/button";

import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/kaivra/ThemeToggle";
import { useProfile, useRoles, useSession, primaryRole } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { ShareQrButton } from "./ShareQrButton";
import { toast } from "sonner";
import {
  clearPushExternalUserId,
  haptic,
  isMedianApp,
  requestPushPermission,
  setPushExternalUserId,
} from "@/lib/median";
import { playNotificationSound } from "@/lib/notification-sound";
import { cn } from "@/lib/utils";
import {
  ADMIN_MODULES,
  canAnalytics,
  EXPIRED_MESSAGE,
  buildAdminAccess,
  timeRemaining,
  useMyProxyGrant,
} from "@/lib/proxy-admin";
import { recordProxyAdminSessionEvent } from "@/lib/proxy-admin.functions";

type NavItem = { to: string; label: string };

/**
 * Investor and adviser menus are fixed. Admin and Super Admin menus are built
 * from ADMIN_MODULES and filtered by the caller's effective permissions, so
 * there is a single source of truth for admin navigation.
 */
const NAV: Record<"investor" | "adviser", NavItem[]> = {
  investor: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/applications", label: "My Applications" },
    { to: "/transactions", label: "Payments" },
    { to: "/inspections", label: "Inspections" },
    { to: "/documents", label: "Documents" },
  ],
  adviser: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/admin", label: "My Applications" },
    { to: "/admin/investors", label: "My Investors" },
    { to: "/admin/inspections", label: "Inspections" },
    { to: "/admin/transactions", label: "Transactions" },
    { to: "/admin/support", label: "Support" },
    { to: "/admin/enquiries", label: "Enquiries" },
  ],
};

const LINK_CLASS =
  "shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Primary desktop navigation. The full item list is rendered once in a hidden
 * measuring row; the visible row then shows only the items that genuinely fit
 * and folds the remainder into a "More" dropdown. Pure layout measurement —
 * no absolute positioning, negative margins, or z-index tricks — so the
 * utility actions on the right can never be overlapped, whatever the width or
 * however many modules a role is allowed to see.
 */
function DesktopNav({ items }: { items: NavItem[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);

  const recalc = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const available = container.clientWidth;
    const widths = Array.from(measure.children).map(
      (child) => (child as HTMLElement).getBoundingClientRect().width,
    );
    const moreWidth = widths.pop() ?? 0; // last child is the More button probe
    const GAP = 4;
    let used = 0;
    let count = 0;
    for (let i = 0; i < widths.length; i += 1) {
      const next = used + (i === 0 ? 0 : GAP) + (widths[i] ?? 0);
      const needsMore = i < widths.length - 1;
      if (next + (needsMore ? GAP + moreWidth : 0) > available) break;
      used = next;
      count += 1;
    }
    setVisibleCount(count);
  }, []);

  useLayoutEffect(() => {
    recalc();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => recalc());
    ro.observe(container);
    return () => ro.disconnect();
  }, [recalc, items]);

  const visible = items.slice(0, visibleCount);
  const overflow = items.slice(visibleCount);

  return (
    <div ref={containerRef} className="ml-8 hidden min-w-0 flex-1 lg:block">
      {/* hidden probe row used only for width measurement */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute flex flex-nowrap items-center gap-1"
      >
        {items.map((item) => (
          <span key={item.to} className={LINK_CLASS}>
            {item.label}
          </span>
        ))}
        <span className={LINK_CLASS}>More</span>
      </div>
      <nav aria-label="Primary" className="flex min-w-0 flex-nowrap items-center gap-1">
        {visible.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={LINK_CLASS}
            activeProps={{ className: "bg-accent text-foreground" }}
          >
            {item.label}
          </Link>
        ))}
        {overflow.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={LINK_CLASS}>
                More
                <ChevronDown className="ml-1 size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {overflow.map((item) => (
                <DropdownMenuItem key={item.to} asChild>
                  <Link to={item.to} activeProps={{ className: "bg-accent text-foreground" }}>
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </nav>
    </div>
  );
}


function useUnreadCount(userId?: string) {
  return useQuery({
    queryKey: ["notifications", "unread", userId],
    enabled: !!userId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const { data: profile } = useProfile(user?.id);
  const role = primaryRole(roles);
  const { data: grant } = useMyProxyGrant(role === "admin" ? user?.id : undefined);
  const access = buildAdminAccess(role, grant ?? null);
  // Proxy admins only ever see the modules their active grant allows; the
  // database re-checks every operation regardless of what the menu shows.
  const items =
    role === "admin" || role === "super_admin"
      ? [
          ...ADMIN_MODULES.filter((m) => access.can(m.key, "view")).map((m) => ({
            to: m.to,
            label: m.label,
          })),
          ...(canAnalytics(access) ? [{ to: "/admin/analytics", label: "Analytics" }] : []),
          ...(access.isSuperAdmin ? [{ to: "/admin/access", label: "Admin Access" }] : []),
        ]
      : NAV[role as "investor" | "adviser"];
  const unread = useUnreadCount(user?.id);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Digital footprint: one sign-in record per browser session for proxy admins.
  useEffect(() => {
    if (!user?.id || !access.isProxyAdmin || access.accessExpired) return;
    const key = `kaivra.proxy-login.${user.id}`;
    if (typeof sessionStorage === "undefined" || sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void recordProxyAdminSessionEvent({ data: { event: "LOGIN" } }).catch(() => {});
  }, [user?.id, access.isProxyAdmin, access.accessExpired]);

  // Expiry is enforced in the database; this simply stops an expired proxy
  // admin from lingering on an admin screen that can no longer load data.
  useEffect(() => {
    if (!access.accessExpired || !pathname.startsWith("/admin")) return;
    void recordProxyAdminSessionEvent({ data: { event: "ACCESS_EXPIRED" } }).catch(() => {});
    toast.error(EXPIRED_MESSAGE);
    void navigate({ to: "/dashboard", replace: true });
  }, [access.accessExpired, pathname, navigate]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);


  // Native shell only: register the signed-in user for push. Every call is a
  // no-op in a normal browser, so nothing changes on the web.
  useEffect(() => {
    if (!user?.id || !isMedianApp()) return;
    requestPushPermission();
    setPushExternalUserId(user.id);
  }, [user?.id]);

  // Live notification alert: as soon as a notification row addressed to the
  // signed-in user is inserted, chime, buzz on native, surface a toast and
  // refresh the unread badge.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { title?: string; body?: string; link?: string | null };
          playNotificationSound();
          haptic();
          toast(row.title || "New notification", {
            description: row.body ?? undefined,
            action: row.link
              ? { label: "View", onClick: () => void navigate({ to: row.link as string }) }
              : undefined,
          });
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient, navigate]);

  function signOut() {
    clearPushExternalUserId();
    if (access.isProxyAdmin) {
      // Recorded before the session is torn down; best-effort only.
      void recordProxyAdminSessionEvent({ data: { event: "LOGOUT" } }).catch(() => {});
    }
    // Navigate first so the click feels instant; tear down caches and the
    // Supabase session right after, without blocking the transition.
    void navigate({ to: "/auth", replace: true });
    void queryClient.cancelQueries();
    queryClient.clear();
    void supabase.auth.signOut();
  }


  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="no-print sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Brand />
          {/* Primary navigation measures itself and folds any items that do not
              fit into a "More" menu, so links can never wrap, clip, or intrude
              into the utility actions (QR / bell / avatar) at any width. */}
          <DesktopNav items={items} />

          <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
            {role === "admin" || role === "super_admin" ? <ShareQrButton /> : null}
            <NotificationBell userId={user?.id} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account" className="rounded-full">
                  <UserAvatar url={profile?.avatar_url} name={profile?.full_name} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">
                  {profile?.full_name || user?.email}
                  <span className="eyebrow mt-1 block text-muted-foreground">
                    {role.replace("_", " ")}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <p className="eyebrow mb-1.5 text-muted-foreground">Theme</p>
                  <ThemeToggle />
                </div>
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-6">
                <SheetTitle className="font-display text-xl tracking-[0.2em]">KAIVRA</SheetTitle>
                <nav className="mt-6 flex flex-col gap-1">
                  {items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="rounded-md px-3 py-3 text-base font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                      activeProps={{ className: "bg-accent text-foreground" }}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <div className="mt-6 border-t border-border pt-4">
                  <p className="eyebrow mb-2 text-muted-foreground">Theme</p>
                  <ThemeToggle />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      {access.isProxyAdmin ? (
        <div
          className={cn(
            "no-print border-b px-4 py-2 text-center text-xs sm:px-6",
            access.accessExpired
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-muted/50 text-muted-foreground",
          )}
        >
          {access.accessExpired
            ? EXPIRED_MESSAGE
            : `Proxy Admin access · ${timeRemaining(access.grant?.expires_at ?? null)} remaining`}
        </div>
      ) : null}
      <main className={cn("flex-1")}>{children}</main>
    </div>
  );
}
