import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut, Menu, User } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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
import { useProfile, useRoles, useSession, primaryRole } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { ShareQrButton } from "./ShareQrButton";
import {
  clearPushExternalUserId,
  isMedianApp,
  requestPushPermission,
  setPushExternalUserId,
} from "@/lib/median";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/kaivra";

type NavItem = { to: string; label: string };

const NAV: Record<AppRole, NavItem[]> = {
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
  ],
  admin: [
    { to: "/admin", label: "Applications" },
    { to: "/admin/investors", label: "Investors" },
    { to: "/admin/transactions", label: "Transactions" },
    { to: "/admin/inspections", label: "Inspections" },
    { to: "/admin/projects", label: "Projects" },
    { to: "/admin/advisers", label: "Advisers" },
  ],
  super_admin: [
    { to: "/admin", label: "Applications" },
    { to: "/admin/investors", label: "Investors" },
    { to: "/admin/transactions", label: "Transactions" },
    { to: "/admin/inspections", label: "Inspections" },
    { to: "/admin/projects", label: "Projects" },
    { to: "/admin/advisers", label: "Advisers" },
  ],
};

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
  const items = NAV[role];
  const unread = useUnreadCount(user?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Native shell only: register the signed-in user for push. Every call is a
  // no-op in a normal browser, so nothing changes on the web.
  useEffect(() => {
    if (!user?.id || !isMedianApp()) return;
    requestPushPermission();
    setPushExternalUserId(user.id);
  }, [user?.id]);

  function signOut() {
    clearPushExternalUserId();
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
          {/* Admin roles carry six links; below lg they overflow the bar, so the
              sheet menu stays in charge until there is room for the full nav. */}
          <nav className="ml-6 hidden min-w-0 items-center gap-1 lg:flex">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-accent text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {role === "admin" || role === "super_admin" ? <ShareQrButton /> : null}
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              className="relative"
            >
              <Link to="/notifications">
                <Bell className="size-5" />
                {unread.data ? (
                  <span className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-[0.6rem] font-bold leading-4 text-primary-foreground">
                    {unread.data > 9 ? "9+" : unread.data}
                  </span>
                ) : null}
              </Link>
            </Button>
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
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main className={cn("flex-1")}>{children}</main>
    </div>
  );
}
