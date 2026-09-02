import { z } from "zod";

/**
 * Server-only contact enquiry intake.
 *
 * Kept in a `.server.ts` module so the service-role Supabase client can never
 * be reached from the browser bundle. Two callers use it:
 *  - `submitContactEnquiry` (server function) when the deployment carries the
 *    service-role secret,
 *  - `/api/public/contact` on the Lovable-hosted origin, used as a relay by
 *    the custom-domain Cloudflare Worker which does not carry that secret.
 */
export const contactEnquirySchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(10).max(2000),
  source_page: z.string().trim().max(300).optional().nullable(),
  // Honeypot: real users never fill this hidden field.
  company: z.string().max(200).optional().nullable(),
});

export type ContactEnquiryInput = z.infer<typeof contactEnquirySchema>;
export type ContactEnquiryResult = { reference: string | null; notified: boolean };

const SUPPORT_EMAIL = "support@kaivra.com";
const ADMIN_URL = "https://kaivraa.com/admin/enquiries";

export function hasServiceRoleKey(): boolean {
  return Boolean(
    typeof process !== "undefined" && process.env && process.env["SUPABASE_SERVICE_ROLE_KEY"],
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

/**
 * Best-effort notification through Resend when RESEND_API_KEY is configured.
 * Failures are logged and swallowed — the enquiry is already stored and
 * visible in the admin workspace.
 */
async function notifySupport(row: {
  reference: string;
  full_name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  created_at: string;
}) {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.warn("[contact] RESEND_API_KEY not configured; enquiry stored without email.");
    return false;
  }
  const from = process.env["CONTACT_FROM_EMAIL"] || "KAIVRA <onboarding@resend.dev>";
  const to = process.env["CONTACT_NOTIFY_EMAIL"] || SUPPORT_EMAIL;
  const lines = [
    ["Reference", row.reference],
    ["Name", row.full_name],
    ["Email", row.email],
    ["Phone", row.phone || "—"],
    ["Subject", row.subject],
    ["Received", new Date(row.created_at).toUTCString()],
  ];
  const html = `<p>A new enquiry has been submitted through the KAIVRA website.</p>
<table cellpadding="6">${lines
    .map(
      ([k, v]) =>
        `<tr><td><strong>${escapeHtml(String(k))}</strong></td><td>${escapeHtml(String(v))}</td></tr>`,
    )
    .join("")}</table>
<p><strong>Message</strong><br/>${escapeHtml(row.message).replace(/\n/g, "<br/>")}</p>
<p><a href="${ADMIN_URL}">Open in the KAIVRA admin workspace</a></p>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: row.email,
        subject: `New KAIVRA Website Enquiry — ${row.subject}`,
        html,
      }),
    });
    if (!res.ok) {
      console.error("[contact] email provider rejected notification", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[contact] email notification failed", err);
    return false;
  }
}

export async function recordContactEnquiry(
  data: ContactEnquiryInput,
): Promise<ContactEnquiryResult> {
  // Honeypot hit: pretend success, store nothing.
  if (data.company && data.company.trim().length > 0) {
    return { reference: null, notified: false };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Abuse protection: cap submissions per email address per hour.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("contact_enquiries")
    .select("id", { count: "exact", head: true })
    .eq("email", data.email.toLowerCase())
    .gte("created_at", since);
  if ((count ?? 0) >= 3) {
    throw new Error(
      "You have already sent several enquiries recently. A KAIVRA adviser will reply shortly.",
    );
  }

  const { data: row, error } = await supabaseAdmin
    .from("contact_enquiries")
    .insert({
      // The BEFORE INSERT trigger always overwrites this with a unique
      // KVR-E reference; the column is NOT NULL so a placeholder is needed.
      reference: "",
      full_name: data.full_name,
      email: data.email.toLowerCase(),
      phone: data.phone?.trim() || null,
      subject: data.subject,
      message: data.message,
      source_page: data.source_page || null,
    })
    .select("reference, full_name, email, phone, subject, message, created_at")
    .single();

  if (error || !row) {
    console.error("[contact] insert failed", error);
    throw new Error("Your enquiry could not be recorded. Please try again.");
  }

  const notified = await notifySupport({
    reference: row.reference,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    created_at: row.created_at,
  });

  return { reference: row.reference, notified };
}
