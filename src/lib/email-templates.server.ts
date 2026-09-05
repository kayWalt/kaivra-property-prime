/**
 * KAIVRA branded email templates.
 *
 * Server-only. Every template is plain HTML with inline styles (email clients
 * strip <style> blocks and never load Tailwind), using the KAIVRA palette:
 * onyx #101312, ivory #F7F4EE, emerald #0E6B4F, champagne gold #C8A96A.
 */

export type EmailCategory = "transactional" | "marketing";

export type RenderedEmail = { subject: string; html: string; text: string };

const SITE_URL = "https://kaivraa.com";

const ONYX = "#101312";
const IVORY = "#F7F4EE";
const EMERALD = "#0E6B4F";
const GOLD = "#C8A96A";

export function escapeHtml(value: string) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function paragraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#2A2E2C;">${escapeHtml(
          p,
        ).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}

export function money(amount: number | null | undefined, currency = "NGN") {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

/** Shell used by every KAIVRA email. */
export function layout(opts: {
  heading: string;
  intro?: string;
  bodyHtml: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  footerNote?: string;
  unsubscribeUrl?: string | null;
}) {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<tr><td style="padding:8px 0 24px;"><a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:${EMERALD};color:${IVORY};text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;letter-spacing:.02em;">${escapeHtml(
          opts.ctaLabel,
        )}</a></td></tr>`
      : "";
  const unsub = opts.unsubscribeUrl
    ? `<br/><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#6B7472;">Unsubscribe from KAIVRA property updates</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:${IVORY};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(opts.intro ?? opts.heading)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:28px 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E6E1D6;border-radius:16px;overflow:hidden;">
<tr><td style="background:${ONYX};padding:22px 28px;">
  <span style="color:${IVORY};font-size:20px;letter-spacing:.32em;font-weight:600;">KAIVRA</span>
  <div style="color:${GOLD};font-size:11px;letter-spacing:.18em;margin-top:6px;">SMART REAL ESTATE INVESTMENT MANAGEMENT</div>
</td></tr>
<tr><td style="padding:28px;">
  <h1 style="margin:0 0 14px;font-size:22px;line-height:30px;color:${ONYX};font-weight:600;">${escapeHtml(opts.heading)}</h1>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>${opts.bodyHtml}</td></tr>${cta}</table>
</td></tr>
<tr><td style="background:#FAF8F3;border-top:1px solid #E6E1D6;padding:18px 28px;font-size:12px;line-height:19px;color:#6B7472;">
  ${escapeHtml(opts.footerNote ?? "This message relates to your KAIVRA investment account.")}<br/>
  <a href="${SITE_URL}" style="color:${EMERALD};">kaivraa.com</a>${unsub}
</td></tr>
</table>
</td></tr></table></body></html>`;
}

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function rows(items: [string, string][]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px;border-collapse:collapse;">${items
    .map(
      ([k, v]) =>
        `<tr><td style="padding:7px 0;font-size:13px;color:#6B7472;width:42%;">${escapeHtml(k)}</td><td style="padding:7px 0;font-size:14px;color:${ONYX};font-weight:600;">${escapeHtml(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

const STATUS_COPY: Record<string, { heading: string; message: string }> = {
  submitted: {
    heading: "We have received your application",
    message:
      "Your KAIVRA application has been submitted successfully and is now with our review team. You will hear from us as each stage completes.",
  },
  under_review: {
    heading: "Your application is under review",
    message:
      "A KAIVRA adviser is reviewing your application and supporting documents. No action is needed from you right now.",
  },
  payment_verification: {
    heading: "We are verifying your payment",
    message:
      "Your payment details are being confirmed against our records. We will notify you as soon as verification completes.",
  },
  approved: {
    heading: "Your application has been approved",
    message:
      "Congratulations — your KAIVRA application has been approved. Your documents and allocation details are available in your investor workspace.",
  },
  rejected: {
    heading: "An update on your application",
    message:
      "Your KAIVRA application could not be approved at this time. Our team has included the reason below and is happy to discuss next steps.",
  },
  requires_correction: {
    heading: "Action needed on your application",
    message:
      "Some details on your application need to be corrected before we can continue. Please sign in and update the highlighted items.",
  },
};

export type TemplateInput = Record<string, any>;

/** Renders an outbox row into a finished email. */
export function renderTemplate(
  kind: string,
  payload: TemplateInput,
  opts: { unsubscribeUrl?: string | null } = {},
): RenderedEmail {
  switch (kind) {
    case "application_status": {
      const copy = STATUS_COPY[String(payload["status"])] ?? {
        heading: "An update on your application",
        message: "There has been an update on your KAIVRA application.",
      };
      const body =
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#2A2E2C;">Dear ${escapeHtml(
          payload["full_name"] || "Investor",
        )},</p>` +
        `<p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#2A2E2C;">${escapeHtml(copy.message)}</p>` +
        rows([
          ["Application reference", String(payload["reference"] ?? "—")],
          ["Current status", String(payload["status"] ?? "").replace(/_/g, " ")],
        ]) +
        (payload["review_note"]
          ? `<p style="margin:0 0 16px;padding:12px 14px;background:#FAF8F3;border-left:3px solid ${GOLD};font-size:14px;line-height:22px;color:#2A2E2C;">${escapeHtml(
              String(payload["review_note"]),
            )}</p>`
          : "");
      const html = layout({
        heading: copy.heading,
        intro: copy.message,
        bodyHtml: body,
        ctaLabel: "Open my application",
        ctaUrl: `${SITE_URL}/applications/${payload["application_id"]}`,
        footerNote:
          "This is a service message about your KAIVRA application and is sent to all applicants.",
      });
      return {
        subject: `KAIVRA — ${copy.heading} (${payload["reference"] ?? "application"})`,
        html,
        text: stripHtml(html),
      };
    }

    case "payment_reminder": {
      const overdue = Boolean(payload["overdue"]);
      const heading = overdue ? "Outstanding payment reminder" : "Your next payment is due";
      const body =
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#2A2E2C;">Dear ${escapeHtml(
          payload["full_name"] || "Investor",
        )},</p>` +
        `<p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#2A2E2C;">${
          overdue
            ? "Our records show an outstanding balance on your KAIVRA investment that is now past the expected schedule."
            : "This is a friendly reminder about the balance remaining on your KAIVRA investment."
        }</p>` +
        rows([
          ["Application reference", String(payload["reference"] ?? "—")],
          ["Property", String(payload["property_name"] ?? "—")],
          ["Total investment", money(payload["total"], payload["currency"])],
          ["Total verified payments", money(payload["paid"], payload["currency"])],
          ["Outstanding balance", money(payload["outstanding"], payload["currency"])],
          ["Last payment received", String(payload["last_payment"] ?? "No payment recorded yet")],
        ]) +
        `<p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#6B7472;">If you have already paid, please upload your payment proof so our team can verify it.</p>`;
      const html = layout({
        heading,
        bodyHtml: body,
        ctaLabel: "Record or review my payment",
        ctaUrl: `${SITE_URL}/applications/${payload["application_id"]}`,
        footerNote:
          "This is a service message about payments on your KAIVRA investment and is sent to all investors with an outstanding balance.",
      });
      return { subject: `KAIVRA — ${heading} (${payload["reference"] ?? ""})`.trim(), html, text: stripHtml(html) };
    }

    case "new_listing": {
      const body =
        paragraphs(
          `A new property is now available on KAIVRA. Explore the details, pricing and payment plans in your investor workspace.`,
        ) +
        rows([
          ["Property", String(payload["property_name"] ?? "—")],
          ["Reference", String(payload["property_code"] ?? "—")],
          ["Price", money(payload["unit_price"], payload["currency"])],
        ]);
      const html = layout({
        heading: `New listing: ${payload["property_name"] ?? "KAIVRA property"}`,
        bodyHtml: body,
        ctaLabel: "View the listing",
        ctaUrl: `${SITE_URL}/projects/${payload["project_id"] ?? ""}`,
        footerNote: "You are receiving this because you opted in to KAIVRA property updates.",
        unsubscribeUrl: opts.unsubscribeUrl ?? null,
      });
      return {
        subject: `KAIVRA — New listing: ${payload["property_name"] ?? "a new property"}`,
        html,
        text: stripHtml(html),
      };
    }

    case "price_change": {
      const prev = Number(payload["previous_price"] ?? 0);
      const next = Number(payload["unit_price"] ?? 0);
      const direction = next > prev ? "increased" : "reduced";
      const body =
        paragraphs(
          `The price of a KAIVRA property you may be following has ${direction}. This notice reflects an actual change recorded in our listings.`,
        ) +
        rows([
          ["Property", String(payload["property_name"] ?? "—")],
          ["Previous price", money(prev, payload["currency"])],
          ["New price", money(next, payload["currency"])],
        ]);
      const html = layout({
        heading: `Price update: ${payload["property_name"] ?? "KAIVRA property"}`,
        bodyHtml: body,
        ctaLabel: "View the property",
        ctaUrl: `${SITE_URL}/projects/${payload["project_id"] ?? ""}`,
        footerNote: "You are receiving this because you opted in to KAIVRA property updates.",
        unsubscribeUrl: opts.unsubscribeUrl ?? null,
      });
      return {
        subject: `KAIVRA — Price ${direction}: ${payload["property_name"] ?? "property"}`,
        html,
        text: stripHtml(html),
      };
    }

    case "announcement": {
      const html = layout({
        heading: String(payload["heading"] ?? "A message from KAIVRA"),
        bodyHtml: paragraphs(String(payload["body"] ?? "")),
        ctaLabel: (payload["cta_label"] as string) || null,
        ctaUrl: (payload["cta_url"] as string) || null,
        footerNote:
          payload["category"] === "transactional"
            ? "This is an important service message about your KAIVRA account."
            : "You are receiving this because you opted in to KAIVRA property updates.",
        unsubscribeUrl: payload["category"] === "transactional" ? null : (opts.unsubscribeUrl ?? null),
      });
      return {
        subject: String(payload["subject"] ?? "A message from KAIVRA"),
        html,
        text: stripHtml(html),
      };
    }

    case "test": {
      const html = layout({
        heading: "KAIVRA email delivery test",
        bodyHtml: paragraphs(
          "This is a test message from the KAIVRA notification system.\n\nIf you can read this, sending, branding and delivery are working correctly. No investor received this email.",
        ),
        footerNote: "Test message — sent only to the configured KAIVRA test recipient.",
      });
      return { subject: "KAIVRA — email delivery test", html, text: stripHtml(html) };
    }

    default: {
      const html = layout({
        heading: "A message from KAIVRA",
        bodyHtml: paragraphs(String(payload["body"] ?? "")),
      });
      return { subject: "A message from KAIVRA", html, text: stripHtml(html) };
    }
  }
}
