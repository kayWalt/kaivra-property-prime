import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Notifies KAIVRA staff (admins + advisers on the project) about an event
 * raised by an investor.
 *
 * Investors cannot insert notification rows for other users — RLS only allows
 * notifications addressed to themselves. This runs the fan-out server-side
 * with privileged access after the caller has been authenticated, so investor
 * actions (inspection requests, payment proofs, submissions) never fail just
 * because staff could not be notified.
 */
export const notifyProjectStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        projectId: z.string().uuid().nullable().optional(),
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(2000),
        link: z.string().min(1).max(300),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const targets = new Set<string>();
    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "super_admin"]);
    admins?.forEach((a) => targets.add(a.user_id));

    if (data.projectId) {
      const { data: advisers } = await supabaseAdmin
        .from("project_advisers")
        .select("adviser_id")
        .eq("project_id", data.projectId);
      advisers?.forEach((a) => targets.add(a.adviser_id));
    }

    if (targets.size === 0) return { notified: 0 };

    const { error } = await supabaseAdmin.from("notifications").insert(
      Array.from(targets).map((user_id) => ({
        user_id,
        title: data.title,
        body: data.body,
        link: data.link,
      })),
    );
    if (error) throw new Error("Staff could not be notified.");
    return { notified: targets.size };
  });
