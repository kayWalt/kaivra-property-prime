import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminCan } from "@/lib/admin-permissions.server";

const inviteSchema = z.object({
  email: z.string().trim().email().max(255),
  fullName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  projectIds: z.array(z.string().uuid()).max(50).default([]),
  redirectTo: z.string().url().max(500),
});

/**
 * Invites a brand-new adviser. Only administrators may call it: the caller's
 * roles are read through their own authenticated client (RLS applies) before
 * any privileged work happens.
 */
export const sendAdviserInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Privileged: issues an auth invitation with the service role, so a Proxy
    // Admin must explicitly hold `advisers.manage`.
    await assertAdminCan(context.supabase as never, context.userId, "advisers", "manage");

    const email = data.email.toLowerCase();

    const invitationValues = {
      email,
      full_name: data.fullName || null,
      phone: data.phone || null,
      project_ids: data.projectIds,
      invited_by: context.userId,
      status: "pending",
      error_detail: null,
    };
    const { data: existingInvitation, error: lookupError } = await context.supabase
      .from("adviser_invitations")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (lookupError) {
      console.error("adviser invitation lookup failed", lookupError.message);
      throw new Error("The invitation could not be recorded. Please try again.");
    }

    const invitationResult = existingInvitation?.id
      ? await context.supabase
          .from("adviser_invitations")
          .update(invitationValues)
          .eq("id", existingInvitation.id)
          .select("id")
          .single()
      : await context.supabase
          .from("adviser_invitations")
          .insert(invitationValues)
          .select("id")
          .single();
    const { data: invitation, error: invitationError } = invitationResult;
    if (invitationError) {
      console.error("adviser invitation upsert failed", invitationError.message);
      throw new Error("The invitation could not be recorded. Please try again.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: data.redirectTo,
      data: { full_name: data.fullName || null, invited_as: "adviser" },
    });

    if (inviteError) {
      if (invitation?.id) {
        await context.supabase
          .from("adviser_invitations")
          .update({ status: "failed", error_detail: inviteError.message })
          .eq("id", invitation.id);
      }
      console.error("adviser invite failed", inviteError.message);
      const configIssue = /smtp|email|sender|not enabled|configur/i.test(inviteError.message);
      throw new Error(
        configIssue
          ? "Invitation email could not be sent because email delivery is not configured yet for this project."
          : "Invitation could not be sent. Please check the address and try again.",
      );
    }

    return { ok: true, email };
  });
