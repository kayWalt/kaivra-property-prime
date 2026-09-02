/**
 * Shared (browser-safe) vocabulary for the KAIVRA correction-request and
 * complaint workflow. No privileged access lives here — every state change is
 * performed by an authenticated server function.
 */

export const CORRECTION_STATUSES = [
  "submitted",
  "acknowledged",
  "under_review",
  "additional_info",
  "approved",
  "applied",
  "rejected",
  "resolved",
] as const;

export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

export const CORRECTION_STATUS_LABEL: Record<CorrectionStatus, string> = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  under_review: "Under Review",
  additional_info: "Additional Information Required",
  approved: "Approved",
  applied: "Correction Applied",
  rejected: "Rejected",
  resolved: "Resolved",
};

export function correctionTone(
  status: CorrectionStatus,
): "neutral" | "gold" | "emerald" | "red" {
  switch (status) {
    case "approved":
    case "applied":
    case "resolved":
      return "emerald";
    case "rejected":
      return "red";
    case "submitted":
      return "neutral";
    default:
      return "gold";
  }
}

/** Application JSONB column a section maps to, or null when handled manually. */
export type CorrectionColumn = "personal" | "contact" | "investment" | "payment_info" | null;

export interface CorrectionSection {
  value: string;
  label: string;
  column: CorrectionColumn;
  fields: { key: string; label: string }[];
}

export const CORRECTION_SECTIONS: CorrectionSection[] = [
  {
    value: "personal",
    label: "Personal information",
    column: "personal",
    fields: [
      { key: "full_name", label: "Full name" },
      { key: "date_of_birth", label: "Date of birth" },
      { key: "gender", label: "Gender" },
      { key: "nationality", label: "Nationality" },
      { key: "marital_status", label: "Marital status" },
      { key: "occupation", label: "Occupation" },
      { key: "company", label: "Company" },
    ],
  },
  {
    value: "address",
    label: "Address",
    column: "personal",
    fields: [
      { key: "residential_address", label: "Residential address" },
      { key: "state", label: "State" },
      { key: "country", label: "Country" },
    ],
  },
  {
    value: "contact",
    label: "Contact information",
    column: "contact",
    fields: [
      { key: "phone", label: "Phone" },
      { key: "alt_phone", label: "Alternate phone" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "email", label: "Email" },
      { key: "mailing_address", label: "Mailing address" },
    ],
  },
  {
    value: "investment",
    label: "Investment information",
    column: "investment",
    fields: [
      { key: "units", label: "Number of units" },
      { key: "payment_plan", label: "Payment plan" },
      { key: "property_type", label: "Property type" },
      { key: "property_size", label: "Property size" },
    ],
  },
  {
    value: "payment",
    label: "Payment information",
    column: "payment_info",
    fields: [
      { key: "subscriber_name", label: "Subscriber name" },
      { key: "sender", label: "Payment sender" },
      { key: "bank", label: "Bank" },
      { key: "description", label: "Payment description" },
    ],
  },
  {
    value: "bank",
    label: "Bank / payment account details",
    column: null,
    fields: [],
  },
  {
    value: "property",
    label: "Property / investment selection",
    column: null,
    fields: [],
  },
  {
    value: "document",
    label: "Uploaded document",
    column: null,
    fields: [],
  },
  { value: "other", label: "Other", column: null, fields: [] },
];

export function sectionOf(value: string) {
  return CORRECTION_SECTIONS.find((s) => s.value === value) ?? null;
}

export function fieldLabelOf(section: string, key: string) {
  return sectionOf(section)?.fields.find((f) => f.key === key)?.label ?? key;
}

export interface CorrectionRequestRow {
  id: string;
  reference: string | null;
  investor_id: string;
  application_id: string | null;
  section: string;
  field_label: string;
  current_value: string | null;
  requested_value: string;
  reason: string;
  status: string;
  investor_response: string | null;
  admin_response: string | null;
  admin_note?: string | null;
  resolution_details: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ complaints */

export const COMPLAINT_STATUSES = [
  "open",
  "acknowledged",
  "under_review",
  "waiting_investor",
  "in_progress",
  "resolved",
  "closed",
] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: "Submitted",
  acknowledged: "Acknowledged",
  under_review: "Under Review",
  waiting_investor: "Awaiting Investor Response",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const COMPLAINT_CATEGORIES = [
  "Payment",
  "Application handling",
  "Documents",
  "Property/project",
  "Staff conduct",
  "Service delay",
  "Other",
] as const;

export function complaintStatusLabel(status: string) {
  return (COMPLAINT_STATUS_LABEL as Record<string, string>)[status] ?? status;
}

export function complaintTone(status: string): "neutral" | "gold" | "emerald" | "red" {
  if (status === "resolved" || status === "closed") return "emerald";
  if (status === "open") return "neutral";
  return "gold";
}
