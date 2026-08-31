import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { useSession } from "@/hooks/useAuth";
import { formatDate } from "@/lib/kaivra";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Notifications" },
      { name: "description", content: "Updates on your applications, payments and approvals." },
      { property: "og:title", content: "KAIVRA | Notifications" },
      { property: "og:description", content: "Updates on your investments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Notifications,
});

function Notifications() {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, link, read_at, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!user?.id || !list.data?.some((n) => !n.read_at)) return;
    void supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null)
      .then(() => queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] }));
  }, [list.data, user?.id, queryClient]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl">Notifications</h1>

      <div className="mt-8 space-y-2">
        {list.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />) : null}
        {list.data?.length === 0 ? (
          <EmptyState title="No notifications yet." body="We will let you know when there is an update." />
        ) : null}
        {list.data?.map((item) => {
          const card = (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">{item.title}</h2>
                <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
            </>
          );
          return item.link ? (
            <Link
              key={item.id}
              to={item.link}
              className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/60"
            >
              {card}
            </Link>
          ) : (
            <article key={item.id} className="rounded-lg border border-border bg-card p-4">
              {card}
            </article>
          );
        })}
      </div>
    </div>
  );
}
