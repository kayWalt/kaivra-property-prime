import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { useRoles, useSession, primaryRole } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/admin/advisers")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Advisers" },
      { name: "description", content: "Assign KAIVRA advisers to the real estate projects they manage." },
      { property: "og:title", content: "KAIVRA | Advisers" },
      { property: "og:description", content: "Manage adviser access to KAIVRA projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdvisersPage,
});

type Adviser = { id: string; full_name: string | null; email: string | null; projects: string[] };

function AdvisersPage() {
  const { user } = useSession();
  const { data: roles, isLoading: rolesLoading } = useRoles(user?.id);
  const role = primaryRole(roles);
  const canManage = role === "admin" || role === "super_admin";
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");

  const projects = useQuery({
    queryKey: ["admin-projects-simple"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const advisers = useQuery({
    queryKey: ["admin-advisers"],
    enabled: canManage,
    queryFn: async () => {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "adviser");
      if (roleError) throw roleError;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as Adviser[];

      const [{ data: profileRows, error: profileError }, { data: assignments, error: assignError }] =
        await Promise.all([
          supabase.from("profiles").select("id, full_name, email").in("id", ids),
          supabase.from("project_advisers").select("project_id, adviser_id").in("adviser_id", ids),
        ]);
      if (profileError) throw profileError;
      if (assignError) throw assignError;

      return ids.map((id) => ({
        id,
        full_name: profileRows?.find((p) => p.id === id)?.full_name ?? null,
        email: profileRows?.find((p) => p.id === id)?.email ?? null,
        projects: (assignments ?? []).filter((a) => a.adviser_id === id).map((a) => a.project_id),
      })) as Adviser[];
    },
  });

  const grantAdviser = useMutation({
    mutationFn: async (targetEmail: string) => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", targetEmail.trim())
        .maybeSingle();
      if (error) throw error;
      if (!profile) throw new Error("No KAIVRA account uses that email address.");
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert({ user_id: profile.id, role: "adviser" });
      if (insertError && insertError.code !== "23505") throw insertError;
    },
    onSuccess: () => {
      setEmail("");
      toast.success("Adviser access granted");
      void queryClient.invalidateQueries({ queryKey: ["admin-advisers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleAssignment = useMutation({
    mutationFn: async ({ adviserId, projectId, assigned }: { adviserId: string; projectId: string; assigned: boolean }) => {
      if (assigned) {
        const { error } = await supabase
          .from("project_advisers")
          .delete()
          .eq("adviser_id", adviserId)
          .eq("project_id", projectId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("project_advisers")
          .insert({ adviser_id: adviserId, project_id: projectId });
        if (error) throw error;
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-advisers"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  if (rolesLoading) return <Skeleton className="h-40 w-full" />;
  if (!canManage) {
    return <EmptyState title="Not available" body="Only KAIVRA administrators can manage advisers." />;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Administration</p>
        <h1 className="font-display text-3xl">Advisers</h1>
        <p className="text-sm text-muted-foreground">
          Grant adviser access and choose which projects each adviser can review.
        </p>
      </header>

      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) grantAdviser.mutate(email);
        }}
      >
        <div className="min-w-[16rem] flex-1 space-y-2">
          <label htmlFor="adviser-email" className="text-xs uppercase tracking-widest text-muted-foreground">
            Adviser email
          </label>
          <Input
            id="adviser-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="adviser@example.com"
            required
          />
        </div>
        <Button type="submit" disabled={grantAdviser.isPending}>
          {grantAdviser.isPending ? "Granting…" : "Grant adviser access"}
        </Button>
      </form>

      {advisers.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (advisers.data ?? []).length === 0 ? (
        <EmptyState title="No advisers yet" body="Grant adviser access above to build your team." />
      ) : (
        <div className="space-y-4">
          {(advisers.data ?? []).map((adviser) => (
            <article key={adviser.id} className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-display text-xl">{adviser.full_name ?? "Unnamed adviser"}</h2>
              <p className="text-sm text-muted-foreground">{adviser.email ?? "—"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(projects.data ?? []).map((project) => {
                  const assigned = adviser.projects.includes(project.id);
                  return (
                    <Button
                      key={project.id}
                      type="button"
                      size="sm"
                      variant={assigned ? "default" : "outline"}
                      onClick={() =>
                        toggleAssignment.mutate({ adviserId: adviser.id, projectId: project.id, assigned })
                      }
                    >
                      {project.name}
                    </Button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
