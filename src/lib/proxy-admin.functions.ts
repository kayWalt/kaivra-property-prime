import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_ACTIONS, ADMIN_MODULES, RESTRICTED_MESSAGE, type ProxyGrant } from "@/lib/proxy-admin";

/**
 * Super Admin-only management of Proxy Admins.
 *
 * Every handler re-derives the caller's role from the database through their
 * own RLS-scoped client (never from anything the browser sent) and refuses the
 * request unless they hold `super_admin`. Only then is the service-role client
 * loaded, inside the handler, to perform the privileged work (role rows and
 * auth invitations). No secret ever reaches the browser.
 */

const moduleKeys = ADMIN_MODULES.map((m) => m.key) as [string, ...string[]];

const permissionsSchema = z.record(
  z.enum(moduleKeys),
  z.array(z.enum(ADMIN_ACTIONS as unknown as [string, ...string[]])).max(10),
);

async function requireSuperAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(RESTRICTED_MESSAGE);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("super_admin")) throw new Error(RESTRICTED_MESSAGE);
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", context.userId)
    .maybeSingle();
  return { actorName: profile?.full_name ?? profile?.email ?? null };
}

function requestMeta() {
  try {
    return {
      ip:
        getRequestHeader("cf-connecting-ip") ||
        getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
        null,
      userAgent: getRequestHeader("user-agent") ?? null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/** Append-only digital footprint. Written with the caller's own client. */
async function audit(
  context: { supabase: any; userId: string },
  actorName: string | null,
  entry: {
    action: string;
    subject_user?: string | null;
    entity_id?: string | null;
    detail: Record<string, unknown>;
  },
) {
  const meta = requestMeta();
  const { error } = await context.supabase.from("admin_audit_events").insert({
    actor: context.userId,
    actor_name: actorName,
    actor_role: "super_admin",
    action: entry.action,
    subject_user: entry.subject_user ?? null,
    entity_type: "proxy_admin_grant",
    entity_id: entry.entity_id ?? null,
    ip_address: meta.ip,
    user_agent: meta.userAgent,
    detail: { ...entry.detail, result: "success" },
  });
  if (error) console.error("[proxy-admin] audit failed", error.message);
}

/** Finds an existing auth identity by email without creating a duplicate. */
async function findAuthUserByEmail(
  admin: { auth: { admin: { listUsers: (o: { page: number; perPage: number }) => Promise<any> } } },
  email: string,
): Promise<{ id: string; email: string | null } | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const users = (data?.users ?? []) as { id: string; email?: string | null }[];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return { id: hit.id, email: hit.email ?? null };
    if (users.length < 200) return null;
  }
  return null;
}

export type ProxyAdminRow = {
  user_id: string;
  grant: ProxyGrant;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  granted_by_name: string | null;
  last_sign_in_at: string | null;
  /** Auth identity state — drives the invitation / activation UI. */
  invited_at: string | null;
  activated_at: string | null;
};


/** Lists every proxy admin with their grant, profile and last sign-in. */
export const listProxyAdmins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    const { data: grants, error } = await context.supabase
      .from("proxy_admin_grants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Proxy admins could not be loaded.");
    const rows = (grants ?? []) as { user_id: string; granted_by: string | null }[];
    const ids = Array.from(
      new Set(rows.flatMap((g) => [g.user_id, g.granted_by].filter(Boolean) as string[])),
    );
    const { data: profiles } = ids.length
      ? await context.supabase
          .from("profiles")
          .select("id, full_name, email, phone, avatar_url")
          .in("id", ids)
      : { data: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    type AuthState = {
      lastSignIn: string | null;
      invitedAt: string | null;
      activatedAt: string | null;
      email: string | null;
    };
    const authState = new Map<string, AuthState>();
    await Promise.all(
      rows.map(async (g) => {
        try {
          const { data } = await supabaseAdmin.auth.admin.getUserById(g.user_id);
          const u = data?.user;
          authState.set(g.user_id, {
            lastSignIn: u?.last_sign_in_at ?? null,
            invitedAt: (u as { invited_at?: string } | undefined)?.invited_at ?? null,
            activatedAt: u?.email_confirmed_at ?? null,
            email: u?.email ?? null,
          });
        } catch {
          authState.set(g.user_id, {
            lastSignIn: null,
            invitedAt: null,
            activatedAt: null,
            email: null,
          });
        }
      }),
    );

    const byId = new Map(
      ((profiles ?? []) as {
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        avatar_url: string | null;
      }[]).map((p) => [p.id, p]),
    );

    return {
      proxyAdmins: rows.map((g) => {
        const profile = byId.get(g.user_id);
        const granter = g.granted_by ? byId.get(g.granted_by) : undefined;
        const auth = authState.get(g.user_id);
        return {
          user_id: g.user_id,
          grant: g as unknown as ProxyGrant,
          full_name: profile?.full_name ?? null,
          // The auth identity is the source of truth for the login address.
          email: auth?.email ?? profile?.email ?? null,
          phone: profile?.phone ?? null,
          avatar_url: profile?.avatar_url ?? null,
          granted_by_name: granter?.full_name ?? granter?.email ?? null,
          last_sign_in_at: auth?.lastSignIn ?? null,
          invited_at: auth?.invitedAt ?? null,
          activated_at: auth?.activatedAt ?? null,
        } satisfies ProxyAdminRow;
      }),
    };

  });

const upsertSchema = z.object({
  email: z.string().trim().email().max(255),
  fullName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  permissions: permissionsSchema,
  startsAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  redirectTo: z.string().url().max(500),
});


/**
 * Creates (or re-grants) proxy admin access for a user. Existing users are
 * reused; unknown addresses receive an invitation through the existing
 * Supabase auth invitation flow — no shared or generated passwords ever exist.
 */
export const grantProxyAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => upsertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { actorName } = await requireSuperAdmin(context);
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .ilike("email", email)
      .maybeSingle();

    // An auth identity can exist without a profile row — never duplicate it.
    if (!profile) {
      const existingAuth = await findAuthUserByEmail(supabaseAdmin, email);
      if (existingAuth) profile = { id: existingAuth.id, full_name: data.fullName ?? null, email };
    }

    let invited = false;
    if (!profile) {
      const { data: created, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: data.redirectTo,
          data: { full_name: data.fullName || null, invited_as: "proxy_admin" },
        },
      );
      if (inviteError || !created?.user) {
        console.error("[proxy-admin] invite failed", inviteError?.message);
        throw new Error(
          "The invitation could not be sent. Check that email delivery is configured, then try again.",
        );
      }
      invited = true;
      profile = { id: created.user.id, full_name: data.fullName ?? null, email };
    }

    // Contact details are stored on the existing profile row only when the
    // person has not already supplied their own — never overwrite user data.
    if (data.fullName || data.phone) {
      const { data: current } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, phone")
        .eq("id", profile.id)
        .maybeSingle();
      const patch: Record<string, string> = {};
      if (data.fullName && !current?.full_name) patch["full_name"] = data.fullName;
      if (data.phone && !current?.phone) patch["phone"] = data.phone;
      if (Object.keys(patch).length) {
        if (current) {
          await supabaseAdmin.from("profiles").update(patch as never).eq("id", profile.id);
        } else {
          await supabaseAdmin
            .from("profiles")
            .insert({ id: profile.id, email, ...patch } as never);
        }
      }
    }


    const userId = profile.id;
    if (userId === context.userId) {
      throw new Error("You cannot grant proxy admin access to your own account.");
    }

    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if ((targetRoles ?? []).some((r) => r.role === "super_admin")) {
      throw new Error("This user is a Super Admin and cannot be downgraded to Proxy Admin.");
    }

    // Operational admin role (kept in the single existing roles table).
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (roleError) {
      console.error("[proxy-admin] role grant failed", roleError.message);
      throw new Error("The proxy admin role could not be assigned.");
    }

    const grantValues = {
      user_id: userId,
      permissions: data.permissions,
      status: "active",
      starts_at: data.startsAt,
      expires_at: data.expiresAt,
      note: data.note || null,
      granted_by: context.userId,
      revoked_by: null,
      revoked_at: null,
    };
    const { data: grant, error: grantError } = await context.supabase
      .from("proxy_admin_grants")
      .upsert(grantValues, { onConflict: "user_id" })
      .select("id")
      .single();
    if (grantError) {
      console.error("[proxy-admin] grant failed", grantError.message);
      throw new Error("The proxy admin access could not be saved.");
    }

    await audit(context, actorName, {
      action: invited ? "PROXY_ADMIN_INVITED" : "PROXY_ADMIN_GRANTED",
      subject_user: userId,
      entity_id: grant.id,
      detail: {
        email,
        invited,
        permissions: data.permissions,
        starts_at: data.startsAt,
        expires_at: data.expiresAt,
        note: data.note ?? null,
      },
    });

    return { userId, invited };
  });

const updateSchema = z.object({
  userId: z.string().uuid(),
  permissions: permissionsSchema.optional(),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  status: z.enum(["active", "suspended"]).optional(),
  note: z.string().trim().max(500).nullable().optional(),
  reason: z.string().trim().max(300).optional(),
});

/** Edits permissions, extends access, or suspends/reactivates a proxy admin. */
export const updateProxyAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { actorName } = await requireSuperAdmin(context);

    const { data: before, error: beforeError } = await context.supabase
      .from("proxy_admin_grants")
      .select("*")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (beforeError || !before) throw new Error("That proxy admin could not be found.");

    type GrantPatch = {
      permissions?: typeof data.permissions;
      starts_at?: string;
      expires_at?: string | null;
      note?: string | null;
      status?: string;
      revoked_at?: string | null;
      revoked_by?: string | null;
    };
    const patch: GrantPatch = {};
    if (data.permissions) patch.permissions = data.permissions;
    if (data.startsAt) patch.starts_at = data.startsAt;
    if (data.expiresAt !== undefined) patch.expires_at = data.expiresAt;
    if (data.note !== undefined) patch.note = data.note;
    if (data.status) {
      patch.status = data.status;
      if (data.status === "active") {
        patch.revoked_at = null;
        patch.revoked_by = null;
      }
    }
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase
      .from("proxy_admin_grants")
      .update(patch as Record<string, never>)
      .eq("user_id", data.userId);
    if (error) {
      console.error("[proxy-admin] update failed", error.message);
      throw new Error("The proxy admin access could not be updated.");
    }

    await audit(context, actorName, {
      action: data.status
        ? data.status === "suspended"
          ? "PROXY_ADMIN_SUSPENDED"
          : "PROXY_ADMIN_REACTIVATED"
        : "PROXY_ADMIN_PERMISSIONS_CHANGED",
      subject_user: data.userId,
      entity_id: (before as { id: string }).id,
      detail: {
        before: {
          permissions: (before as { permissions: unknown }).permissions,
          starts_at: (before as { starts_at: string }).starts_at,
          expires_at: (before as { expires_at: string | null }).expires_at,
          status: (before as { status: string }).status,
        },
        after: patch,
        reason: data.reason ?? null,
      },
    });

    return { ok: true };
  });

/** Immediate revocation — privileged access stops on the next database call. */
export const revokeProxyAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ userId: z.string().uuid(), reason: z.string().trim().max(300).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { actorName } = await requireSuperAdmin(context);

    const { data: before } = await context.supabase
      .from("proxy_admin_grants")
      .select("*")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!before) throw new Error("That proxy admin could not be found.");

    const { error } = await context.supabase
      .from("proxy_admin_grants")
      .update({ status: "revoked", revoked_by: context.userId, revoked_at: new Date().toISOString() })
      .eq("user_id", data.userId);
    if (error) {
      console.error("[proxy-admin] revoke failed", error.message);
      throw new Error("The proxy admin access could not be revoked.");
    }

    await audit(context, actorName, {
      action: "PROXY_ADMIN_REVOKED",
      subject_user: data.userId,
      entity_id: (before as { id: string }).id,
      detail: {
        before: { status: (before as { status: string }).status },
        after: { status: "revoked" },
        reason: data.reason ?? null,
      },
    });

    return { ok: true };
  });

/** Audit history for one proxy admin (append-only, admin-readable). */
export const proxyAdminHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const { data: events, error } = await context.supabase
      .from("admin_audit_events")
      .select("id, action, actor_name, detail, created_at, ip_address")
      .or(`subject_user.eq.${data.userId},actor.eq.${data.userId}`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("The access history could not be loaded.");
    return { events: events ?? [] };
  });

/**
 * Re-sends the secure activation link to a Proxy Admin who never activated.
 * Uses the auth provider's short-lived, single-use invite/recovery link — no
 * password is ever generated, transmitted or shown to the Super Admin.
 */
export const resendProxyAdminInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ userId: z.string().uuid(), redirectTo: z.string().url().max(500) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { actorName } = await requireSuperAdmin(context);

    const { data: grant } = await context.supabase
      .from("proxy_admin_grants")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!grant) throw new Error("That proxy admin could not be found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    const email = target?.user?.email;
    if (targetError || !email) throw new Error("That account has no email address on file.");

    const activated = !!target?.user?.email_confirmed_at;
    let sendError: string | null = null;
    if (activated) {
      // Already activated: send a password-reset (recovery) link instead.
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo: data.redirectTo,
      });
      sendError = error?.message ?? null;
    } else {
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: data.redirectTo,
        data: { invited_as: "proxy_admin" },
      });
      sendError = error?.message ?? null;
    }
    if (sendError) {
      console.error("[proxy-admin] resend failed", sendError);
      throw new Error("The invitation could not be sent. Please try again shortly.");
    }

    await audit(context, actorName, {
      action: "PROXY_ADMIN_INVITATION_RESENT",
      subject_user: data.userId,
      entity_id: (grant as { id: string }).id,
      detail: { email, mode: activated ? "password_reset" : "invitation" },
    });

    return { ok: true, activated };
  });

/**
 * Super Admin-only correction of a Proxy Admin's login email (for example when
 * a temporary address was used during testing). The existing authentication
 * identity, permissions, audit history and access window are all preserved —
 * only the address changes, and the new one must be verified by the user.
 */
export const changeProxyAdminEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        userId: z.string().uuid(),
        newEmail: z.string().trim().email().max(255),
        redirectTo: z.string().url().max(500),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { actorName } = await requireSuperAdmin(context);
    if (data.userId === context.userId) {
      throw new Error("Use your own profile to change your own sign-in email.");
    }

    const { data: grant } = await context.supabase
      .from("proxy_admin_grants")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!grant) throw new Error("That proxy admin could not be found.");

    const newEmail = data.newEmail.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const clash = await findAuthUserByEmail(supabaseAdmin, newEmail);
    if (clash && clash.id !== data.userId) {
      throw new Error(
        "Another KAIVRA account already uses that email address. Grant proxy access to that account instead.",
      );
    }

    const { data: target } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const oldEmail = target?.user?.email ?? null;
    if (oldEmail && oldEmail.toLowerCase() === newEmail) return { ok: true, unchanged: true };

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: newEmail,
      email_confirm: false,
    });
    if (updateError) {
      console.error("[proxy-admin] email change failed", updateError.message);
      throw new Error("The sign-in email could not be updated.");
    }

    await supabaseAdmin.from("profiles").update({ email: newEmail } as never).eq("id", data.userId);

    // Verification / activation at the corrected address.
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(newEmail, {
      redirectTo: data.redirectTo,
      data: { invited_as: "proxy_admin" },
    });
    if (inviteError) console.error("[proxy-admin] verification email failed", inviteError.message);

    await audit(context, actorName, {
      action: "PROXY_ADMIN_EMAIL_CHANGED",
      subject_user: data.userId,
      entity_id: (grant as { id: string }).id,
      detail: {
        before: { email: oldEmail },
        after: { email: newEmail },
        verification_sent: !inviteError,
        reason: data.reason ?? null,
      },
    });

    return { ok: true, verificationSent: !inviteError };
  });

/**
 * Digital footprint written by the Proxy Admin's own session (sign-in, sign-out
 * and denied privileged attempts). It is advisory only: the caller can never
 * write anything privileged, the row is stamped with their verified user id,
 * and `admin_audit_events` is append-only.
 */
export const recordProxyAdminSessionEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        event: z.enum(["LOGIN", "LOGOUT", "ACCESS_EXPIRED", "DENIED"]),
        detail: z.string().trim().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: grant } = await context.supabase
      .from("proxy_admin_grants")
      .select("id, status, starts_at, expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!grant) return { ok: false };

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();

    const meta = requestMeta();
    const { error } = await context.supabase.from("admin_audit_events").insert({
      actor: context.userId,
      actor_name: profile?.full_name ?? profile?.email ?? null,
      actor_role: "proxy_admin",
      action: `PROXY_ADMIN_${data.event}`,
      subject_user: context.userId,
      entity_type: "proxy_admin_grant",
      entity_id: (grant as { id: string }).id,
      ip_address: meta.ip,
      user_agent: meta.userAgent,
      detail: { note: data.detail ?? null, grant_status: (grant as { status: string }).status },
    });
    if (error) console.error("[proxy-admin] session audit failed", error.message);
    return { ok: !error };
  });
