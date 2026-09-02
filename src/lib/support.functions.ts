import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SUPPORT_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "waiting_investor",
  "resolved",
  "closed",
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  waiting_investor: "Waiting for Investor",
  resolved: "Resolved",
  closed: "Closed",
};

export const SUPPORT_CATEGORIES = [
  "Application help",
  "Payment",
  "Inspection",
  "Project information",
  "Documents",
  "Account/login",
  "Complaint",
  "Other",
] as const;

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

/**
 * Creates a KAIVRA support request for the authenticated investor and notifies
 * the staff who are allowed to handle it. The ticket itself is written through
 * the caller's own RLS-scoped client, so an investor can only ever raise a
 * request for themselves.
 */
export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        subject: z.string().min(3).max(160),
        category: z.string().min(1).max(60),
        message: z.string().min(5).max(4000),
        priority: z.enum(SUPPORT_PRIORITIES).default("normal"),
        applicationId: z.string().uuid().nullable().optional(),
        projectId: z.string().uuid().nullable().optional(),
        // "complaint" routes the request through the formal complaint workflow
        // (KAI-CM reference, acknowledgement and resolution steps).
        channel: z.enum(["web", "in_app", "complaint"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .insert({
        investor_id: context.userId,
        ...(data.channel ? { channel: data.channel } : {}),
        subject: data.subject,
        category: data.category,
        message: data.message,
        priority: data.priority,
        application_id: data.applicationId ?? null,
        project_id: data.projectId ?? null,
      })
      .select("id, reference, status, created_at")
      .single();

    if (error || !ticket) throw new Error("Your support request could not be created.");
    const isComplaint = data.channel === "complaint";

    // Staff fan-out needs privileged access (investors cannot write another
    // user's notification row). A notification failure must never lose the
    // ticket, so it is best-effort.
    try {
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
      if (targets.size > 0) {
        await supabaseAdmin.from("notifications").insert(
          Array.from(targets).map((user_id) => ({
            user_id,
            title: `${isComplaint ? "New complaint" : "New support request"} · ${ticket.reference ?? ""}`.trim(),
            body: `${data.category}: ${data.subject}`,
            link: "/admin/support",
          })),
        );
      }
    } catch {
      /* notification failure never blocks the request */
    }

    return ticket;
  });

/** Adds a reply (or an internal staff note) to a support request. */
export const replyToSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        ticketId: z.string().uuid(),
        body: z.string().min(1).max(4000),
        internal: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("support_messages").insert({
      ticket_id: data.ticketId,
      author_id: context.userId,
      body: data.body,
      is_internal: data.internal,
    });
    if (error) throw new Error("Your reply could not be sent.");

    if (!data.internal) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ticket } = await supabaseAdmin
          .from("support_tickets")
          .select("investor_id, reference")
          .eq("id", data.ticketId)
          .maybeSingle();
        if (ticket && ticket.investor_id !== context.userId) {
          await supabaseAdmin.from("notifications").insert({
            user_id: ticket.investor_id,
            title: `KAIVRA replied to ${ticket.reference ?? "your support request"}`,
            body: data.body.slice(0, 200),
            link: "/dashboard",
          });
        }
      } catch {
        /* best effort */
      }
    }
    return { ok: true };
  });

/** Staff-only: assign, re-prioritise or move a support request through its lifecycle. */
export const updateSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        ticketId: z.string().uuid(),
        status: z.enum(SUPPORT_STATUSES).optional(),
        priority: z.enum(SUPPORT_PRIORITIES).optional(),
        assignedTo: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      status?: SupportStatus;
      resolved_at?: string | null;
      priority?: string;
      assigned_to?: string | null;
    } = {};
    if (data.status) {
      patch.status = data.status;
      patch.resolved_at =
        data.status === "resolved" || data.status === "closed" ? new Date().toISOString() : null;
    }
    if (data.priority) patch.priority = data.priority;
    if (data.assignedTo !== undefined) patch.assigned_to = data.assignedTo;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase
      .from("support_tickets")
      .update(patch)
      .eq("id", data.ticketId);
    if (error) throw new Error("The support request could not be updated.");
    return { ok: true };
  });

/**
 * Opens (or reuses) a live chat with a KAIVRA agent. Reusing an already-open
 * live conversation keeps the investor's history in one thread instead of
 * creating a new ticket every time the widget is opened.
 */
export const startLiveSupportChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        topic: z.string().min(1).max(160).default("Live chat with a KAIVRA agent"),
        message: z.string().min(1).max(4000),
        category: z.string().min(1).max(60).default("Other"),
        projectId: z.string().uuid().nullable().optional(),
        applicationId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("support_tickets")
      .select("id, reference, status")
      .eq("investor_id", context.userId)
      .not("status", "in", "(resolved,closed)")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let ticket = existing;

    if (!ticket) {
      const { data: created, error } = await context.supabase
        .from("support_tickets")
        .insert({
          investor_id: context.userId,
          subject: data.topic,
          category: data.category,
          message: data.message,
          priority: "normal",
          channel: "in_app",
          application_id: data.applicationId ?? null,
          project_id: data.projectId ?? null,
        })
        .select("id, reference, status")
        .single();
      if (error || !created) throw new Error("The live chat could not be started.");
      ticket = created;
    }

    await context.supabase.from("support_messages").insert({
      ticket_id: ticket.id,
      author_id: context.userId,
      body: data.message,
      is_internal: false,
    });

    try {
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
      if (targets.size > 0) {
        await supabaseAdmin.from("notifications").insert(
          Array.from(targets).map((user_id) => ({
            user_id,
            title: `Live chat · ${ticket.reference ?? ""}`.trim(),
            body: data.message.slice(0, 200),
            link: "/admin/support",
          })),
        );
      }
    } catch {
      /* notification failure never blocks the chat */
    }

    return ticket;
  });

/** Investors may close their own conversation once they are satisfied. */
export const closeMySupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("support_tickets")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", data.ticketId)
      .eq("investor_id", context.userId);
    if (error) throw new Error("The conversation could not be closed.");
    return { ok: true };
  });

