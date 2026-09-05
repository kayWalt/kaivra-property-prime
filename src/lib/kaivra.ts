export type AppRole = "super_admin" | "admin" | "adviser" | "partner" | "investor";

export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  adviser: "Adviser",
  partner: "Partner",
  investor: "Investor",
};

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "payment_verification"
  | "approved"
  | "rejected"
  | "requires_correction";

export type PaymentStatus = "pending" | "verified" | "rejected";

export type PaymentMethod = "bank_transfer" | "bank_deposit" | "pos" | "cash" | "other";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "bank_deposit", label: "Bank Deposit" },
  { value: "pos", label: "POS" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  payment_verification: "Payment Verification",
  approved: "Approved",
  rejected: "Rejected",
  requires_correction: "Requires Correction",
};

export const APPLICATION_STATUSES = Object.keys(STATUS_LABEL) as ApplicationStatus[];

export function formatNaira(value: number | string | null | undefined, currency = "NGN") {
  const amount = Number(value ?? 0);
  const formatted = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
  return `${currency === "NGN" ? "₦" : currency + " "}${formatted}`;
}

/**
 * PDF-safe money formatting. The standard PDF fonts have no naira glyph, so
 * printed documents use the ISO code instead of the ₦ symbol.
 */
export function formatMoneyPdf(value: number | string | null | undefined, currency = "NGN") {
  const amount = Number(value ?? 0);
  const formatted = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
  return `${currency} ${formatted}`;
}

export function formatCompact(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(amount)}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export interface PersonalDetails {
  full_name?: string;
  date_of_birth?: string;
  gender?: string;
  nationality?: string;
  marital_status?: string;
  occupation?: string;
  company?: string;
  residential_address?: string;
  state?: string;
  country?: string;
}

export interface ContactDetails {
  phone?: string;
  email?: string;
  whatsapp?: string;
  alt_phone?: string;
  residential_address?: string;
  mailing_address?: string;
  mailing_same_as_residential?: boolean;
}

export interface InvestmentDetails {
  units?: number;
  unit_price?: number;
  total_value?: number;
  payment_plan?: string;
  property_type?: string;
  property_size?: string;
}

export interface PaymentInfo {
  subscriber_name?: string;
  sender?: string;
  bank?: string;
  email?: string;
  phone?: string;
  address?: string;
  site?: string;
  initial_deposit?: number;
  next_payment_amount?: number;
  next_payment_date?: string;
  description?: string;
}

export const APPLICATION_STEPS = [
  { n: 1, key: "project", label: "Project" },
  { n: 2, key: "personal", label: "Personal" },
  { n: 3, key: "contact", label: "Contact" },
  { n: 4, key: "investment", label: "Investment" },
  { n: 5, key: "payment", label: "Payment" },
  { n: 6, key: "documents", label: "Documents" },
  { n: 7, key: "review", label: "Review" },
] as const;

export function statusTone(status: ApplicationStatus): "neutral" | "gold" | "emerald" | "red" {
  switch (status) {
    case "approved":
      return "emerald";
    case "rejected":
      return "red";
    case "requires_correction":
      return "red";
    case "draft":
      return "neutral";
    default:
      return "gold";
  }
}
