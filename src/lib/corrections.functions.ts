import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CORRECTION_STATUSES } from "./corrections";

/**
 * Secure correction-request and complaint workflow.
 *
 * Investors never write finalised records: they raise a correction request,
 * and only an administrator — verified server-side against `user_roles` — can
 * acknowledge, review, approve, apply or resolve it. Every privileged step
 * writes an append-only audit event and an in-app notification.
 */

type Ctx = { supabase: any; userId: string };

const CORRECTION_SELECT =
  "id, reference, investor_id, application_id, section, field_label, current_value, requested_value, reason, status, investor_response, admin_response, admin_note, resolution_details, acknowledged_at, applied_at, resolved_at, created_at, updated_at";

async function assertAdmin(context: Ctx) {
  const { data: roles, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error("Your permissions could not be verified.");
  const ok = (roles ?? []).some(
    (r: { role: string }) => r.role === "admin" || r.role === "super_admin",
  );
  if (!ok) throw new Error("You are not authorised to manage correction requests.");
}

function requestMeta() {
  try {
    const request = getRequest();
    return {
      ip_address:
        request?.headers.get("cf-connecting-ip") ??
        request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        null,
      user_agent: request?.headers.get("user-agent")?.slice(0, 300) ?? null,
    };
  } catch {
    return { ip_address: null, user_agent: null };
  }
}

/** Append-only digital footprint. Never blocks the action it describes. */
async function audit(
  context: Ctx,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    subjectUser?: string | null;
    detail?: Record<string, unknown>;
    actorRole?: string;
  },
) {
  const meta = requestMeta();
  const row = {
    actor: context.userId,
    action: entry.action,
    subject_user: entry.subjectUser ?? null,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    actor_role: entry.actorRole ?? "admin",
    detail: entry.detail ?? {},
    ...meta,
  };
  const { error } = await context.supabase.from("admin_audit_events").insert(row);
  if (!error) return;
  // Investors hold no insert grant on the audit log — record server-side.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_events").insert(row);
  } catch (err) {
    console.error("[corrections] audit unavailable", err);
  }
}

async function notify(
  context: Ctx,
  userId: string,
  title: string,
  body: string,
  link: string,
) {
  const payload = { user_id: userId, title, body: body.slice(0, 500), link };
  const { error } = await context.supabase.from("notifications").insert(payload);
  if (!error) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("notifications").insert(payload);
  } catch (err) {
    console.error("[corrections] notification unavailable", err);
  }
}

async function notifyStaff(context: Ctx, title: string, body: string, link: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin"]);
    const targets = Array.from(new Set((admins ?? []).map((a) => a.user_id)));
    if (targets.length === 0) return;
    await supabaseAdmin.from("notifications").insert(
      targets.map((user_id) => ({ user_id, title, body: body.slice(0, 500), link })),
    );
  } catch (err) {
    console.error("[corrections] staff fan-out unavailable", err);
  }
}

/* ------------------------------------------------------------- investor side */

export const submitCorrectionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        applicationId: z.string().uuid().nullable().optional(),
        section: z.string().min(1).max(40),
        fieldLabel: z.string().min(1).max(80),
        currentValue: z.string().max(2000).nullable().optional(),
        requestedValue: z.string().min(1).max(2000),
        reason: z.string().min(5).max(2000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: row, error } = await ctx.supabase
      .from("correction_requests")
      .insert({
        investor_id: ctx.userId,
        application_id: data.applicationId ?? null,
        section: data.section,
        field_label: data.fieldLabel,
        current_value: data.currentValue ?? null,
        requested_value: data.requestedValue,
        reason: data.reason,
      })
      .select("id, reference")
      .single();
    if (error || !row) throw new Error("Your correction request could not be submitted.");

    await audit(ctx, {
      action: "INVESTOR_SUBMITTED_CORRECTION_REQUEST",
      entityType: "correction_request",
      entityId: row.id,
      subjectUser: ctx.userId,
      actorRole: "investor",
      detail: {
        reference: row.reference,
        section: data.section,
        field: data.fieldLabel,
        previous_value: data.currentValue ?? null,
        requested_value: data.requestedValue,
        reason: data.reason,
        application_id: data.applicationId ?? null,
      },
    });

    await notifyStaff(
      ctx,
      `Correction request · ${row.reference ?? ""}`.trim(),
      `${data.fieldLabel}: ${data.reason}`,
      "/admin/corrections",
    );

    return row as { id: string; reference: string | null };
  });

/** Investor supplies the extra information KAIVRA asked for. */
export const respondToCorrectionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ id: z.string().uuid(), response: z.string().min(2).max(2000) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("correction_requests")
      .update({ investor_response: data.response })
      .eq("id", data.id)
      .eq("investor_id", ctx.userId);
    if (error) throw new Error("Your response could not be saved.");

    await audit(ctx, {
      action: "INVESTOR_PROVIDED_ADDITIONAL_INFORMATION",
      entityType: "correction_request",
      entityId: data.id,
      subjectUser: ctx.userId,
      actorRole: "investor",
      detail: { response: data.response },
    });
    await notifyStaff(
      ctx,
      "Investor answered a correction request",
      data.response,
      "/admin/corrections",
    );
    return { ok: true };
  });

/* ---------------------------------------------------------------- admin side */

const ADMIN_ACTIONS = {
  acknowledge: { status: "acknowledged", audit: "ADMIN_ACKNOWLEDGED_CORRECTION" },
  under_review: { status: "under_review", audit: "ADMIN_STARTED_CORRECTION_REVIEW" },
  request_info: { status: "additional_info", audit: "ADMIN_REQUESTED_MORE_INFORMATION" },
  approve: { status: "approved", audit: "ADMIN_APPROVED_CORRECTION" },
  reject: { status: "rejected", audit: "ADMIN_REJECTED_CORRECTION" },
  resolve: { status: "resolved", audit: "ADMIN_RESOLVED_CORRECTION" },
} as const;

export const manageCorrectionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["acknowledge", "under_review", "request_info", "approve", "reject", "resolve"]),
        message: z.string().max(2000).optional(),
        internalNote: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);

    const { data: current, error: readError } = await ctx.supabase
      .from("correction_requests")
      .select(CORRECTION_SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !current) throw new Error("This correction request could not be loaded.");

    const step = ADMIN_ACTIONS[data.action];
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: step.status };
    if (data.message) patch["admin_response"] = data.message;
    if (data.internalNote) patch["admin_note"] = data.internalNote;
    if (data.action === "acknowledge") {
      patch["acknowledged_by"] = ctx.userId;
      patch["acknowledged_at"] = now;
    }
    if (data.action === "approve" || data.action === "reject") {
      patch["reviewed_by"] = ctx.userId;
      patch["reviewed_at"] = now;
    }
    if (data.action === "resolve") {
      patch["resolved_by"] = ctx.userId;
      patch["resolved_at"] = now;
      patch["resolution_details"] = data.message ?? current.resolution_details ?? null;
    }

    const { error } = await ctx.supabase
      .from("correction_requests")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error("The correction request could not be updated.");

    await audit(ctx, {
      action: step.audit,
      entityType: "correction_request",
      entityId: data.id,
      subjectUser: current.investor_id,
      detail: {
        reference: current.reference,
        previous_status: current.status,
        new_status: step.status,
        message: data.message ?? null,
        internal_note: data.internalNote ?? null,
      },
    });

    await notify(
      ctx,
      current.investor_id,
      `Correction request ${current.reference ?? ""} · ${step.status.replace(/_/g, " ")}`.trim(),
      data.message ?? "Your correction request status has been updated.",
      "/dashboard",
    );

    return { ok: true, status: step.status };
  });

/**
 * Applies an approved correction to the underlying application record.
 *
 * The previous value is written to the audit trail before the record changes,
 * so the original is never silently destroyed.
 */
export const applyCorrectionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        column: z.enum(["personal", "contact", "investment", "payment_info"]).nullable().optional(),
        fieldKey: z.string().min(1).max(80).nullable().optional(),
        resolutionNote: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);

    const { data: current, error: readError } = await ctx.supabase
      .from("correction_requests")
      .select(CORRECTION_SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !current) throw new Error("This correction request could not be loaded.");
    if (!["approved", "under_review", "acknowledged"].includes(current.status)) {
      throw new Error("Approve the correction before applying it.");
    }

    let previousValue: unknown = current.current_value;
    let applied = false;

    if (current.application_id && data.column && data.fieldKey) {
      const { data: app, error: appError } = await ctx.supabase
        .from("applications")
        .select(`id, ${data.column}`)
        .eq("id", current.application_id)
        .maybeSingle();
      if (appError || !app) throw new Error("The linked application could not be loaded.");
      const blob = ((app as Record<string, unknown>)[data.column] ?? {}) as Record<string, unknown>;
      previousValue = blob[data.fieldKey] ?? null;
      const next = { ...blob, [data.fieldKey]: current.requested_value };
      const { error: updateError } = await ctx.supabase
        .from("applications")
        .update({ [data.column]: next })
        .eq("id", current.application_id);
      if (updateError) throw new Error("The correction could not be applied to the application.");
      applied = true;

      // Mirror into the application's own visible history.
      await ctx.supabase.from("application_events").insert({
        application_id: current.application_id,
        actor: ctx.userId,
        action: "correction_applied",
        detail: `${current.field_label}: "${String(previousValue ?? "—")}" → "${current.requested_value}" (${current.reference})`,
      });
    }

    const now = new Date().toISOString();
    const { error } = await ctx.supabase
      .from("correction_requests")
      .update({
        status: "applied",
        applied_by: ctx.userId,
        applied_at: now,
        resolution_details: data.resolutionNote ?? current.resolution_details ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error("The correction request could not be updated.");

    await audit(ctx, {
      action: "ADMIN_APPLIED_CORRECTION",
      entityType: "correction_request",
      entityId: data.id,
      subjectUser: current.investor_id,
      detail: {
        reference: current.reference,
        target_table: applied ? "applications" : null,
        target_record: current.application_id,
        field: data.fieldKey ?? current.field_label,
        previous_value: previousValue ?? null,
        new_value: current.requested_value,
        reason: current.reason,
        applied_automatically: applied,
        resolution: data.resolutionNote ?? null,
      },
    });

    await notify(
      ctx,
      current.investor_id,
      `Correction applied · ${current.reference ?? ""}`.trim(),
      data.resolutionNote ?? `${current.field_label} has been corrected.`,
      "/dashboard",
    );

    return { ok: true, applied };
  });

/* ---------------------------------------------------------------- complaints */

export const acknowledgeComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const now = new Date().toISOString();
    const { data: ticket, error } = await ctx.supabase
      .from("support_tickets")
      .update({ status: "acknowledged", acknowledged_by: ctx.userId, acknowledged_at: now })
      .eq("id", data.ticketId)
      .select("id, reference, investor_id, subject")
      .single();
    if (error || !ticket) throw new Error("The complaint could not be acknowledged.");

    await audit(ctx, {
      action: "ADMIN_ACKNOWLEDGED_COMPLAINT",
      entityType: "support_ticket",
      entityId: ticket.id,
      subjectUser: ticket.investor_id,
      detail: { reference: ticket.reference, subject: ticket.subject, acknowledged_at: now },
    });
    await notify(
      ctx,
      ticket.investor_id,
      `Complaint acknowledged · ${ticket.reference ?? ""}`.trim(),
      "A KAIVRA administrator has acknowledged your complaint and is reviewing it.",
      "/dashboard",
    );
    return { ok: true };
  });

export const resolveComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ ticketId: z.string().uuid(), resolution: z.string().min(5).max(4000) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const now = new Date().toISOString();
    const { data: ticket, error } = await ctx.supabase
      .from("support_tickets")
      .update({
        status: "resolved",
        resolution_note: data.resolution,
        resolved_by: ctx.userId,
        resolved_at: now,
      })
      .eq("id", data.ticketId)
      .select("id, reference, investor_id, subject")
      .single();
    if (error || !ticket) throw new Error("The complaint could not be resolved.");

    // The resolution message is also posted into the existing conversation.
    await ctx.supabase.from("support_messages").insert({
      ticket_id: ticket.id,
      author_id: ctx.userId,
      body: data.resolution,
      is_internal: false,
    });

    await audit(ctx, {
      action: "ADMIN_RESOLVED_COMPLAINT",
      entityType: "support_ticket",
      entityId: ticket.id,
      subjectUser: ticket.investor_id,
      detail: { reference: ticket.reference, resolution: data.resolution, resolved_at: now },
    });
    await notify(
      ctx,
      ticket.investor_id,
      `Complaint resolved · ${ticket.reference ?? ""}`.trim(),
      data.resolution,
      "/dashboard",
    );
    return { ok: true };
  });

/* --------------------------------------------------------------- attachments */

export const createCorrectionUploadTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ correctionRequestId: z.string().uuid(), fileName: z.string().min(1).max(200) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: allowed, error } = await ctx.supabase
      .from("correction_requests")
      .select("id")
      .eq("id", data.correctionRequestId)
      .maybeSingle();
    if (error || !allowed) throw new Error("You cannot attach documents to this request.");

    const { DOCS_BUCKET, safeFileName } = await import("./storage.server");
    const path = `corrections/${data.correctionRequestId}/${crypto.randomUUID()}-${safeFileName(data.fileName)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket, error: signError } = await supabaseAdmin.storage
      .from(DOCS_BUCKET)
      .createSignedUploadUrl(path);
    if (signError || !ticket) throw new Error("Upload could not be prepared. Please try again.");
    return { path, token: ticket.token, bucket: DOCS_BUCKET };
  });

export const getCorrectionDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ documentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: doc, error } = await ctx.supabase
      .from("correction_request_documents")
      .select("file_path, file_name, mime_type")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error || !doc) throw new Error("Document not found or you do not have access to it.");

    const { DOCS_BUCKET } = await import("./storage.server");
    const mine = await ctx.supabase.storage.from(DOCS_BUCKET).createSignedUrl(doc.file_path, 120);
    if (mine?.data?.signedUrl) {
      return { url: mine.data.signedUrl as string, fileName: doc.file_name as string | null };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from(DOCS_BUCKET)
      .createSignedUrl(doc.file_path, 120);
    if (!signed) throw new Error("Document link could not be created.");
    return { url: signed.signedUrl, fileName: doc.file_name as string | null };
  });

export const CORRECTION_STATUS_VALUES = CORRECTION_STATUSES;
