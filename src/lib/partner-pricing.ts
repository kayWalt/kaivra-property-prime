/**
 * KAIVRA Partner / Adviser / Super Admin purchase pricing.
 *
 * The authenticated database role is the only authority for who may use this;
 * these helpers are presentation-side maths only. Every figure is re-derived
 * and re-validated server side by the `applications_partner_pricing` trigger.
 */
import type { AppRole } from "./kaivra";

export type PricingMethod = "discount" | "negotiated";
export type DiscountApproval = "pending" | "approved" | "rejected";
export type PartnerPaymentState = "unpaid" | "partially_paid" | "fully_paid";

/** Roles allowed to create a partner purchase and set negotiated pricing. */
export const PARTNER_BUYER_ROLES: AppRole[] = ["partner", "adviser", "super_admin"];

export function canPartnerPurchase(roles: AppRole[] | undefined) {
  return (roles ?? []).some((r) => PARTNER_BUYER_ROLES.includes(r));
}

export interface PartnerPricing {
  application_type: string;
  partner_reference: string | null;
  pricing_method: string | null;
  standard_price: number | null;
  discount_percent: number | null;
  negotiated_price: number | null;
  discount_approval: string;
}

export const APPROVAL_LABEL: Record<DiscountApproval, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const PAYMENT_STATE_LABEL: Record<PartnerPaymentState, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  fully_paid: "Fully paid",
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Derives every figure from the single authoritative source value. */
export function derivePricing(input: {
  method: PricingMethod;
  standardPrice: number;
  discountPercent?: number | null;
  negotiatedPrice?: number | null;
}) {
  const standard = Math.max(0, Number(input.standardPrice) || 0);
  if (input.method === "negotiated") {
    const negotiated = Math.min(standard, Math.max(0, Number(input.negotiatedPrice) || 0));
    const discountAmount = round2(standard - negotiated);
    const percent = standard > 0 ? round2((discountAmount / standard) * 100) : 0;
    return { standard, negotiated: round2(negotiated), discountAmount, percent };
  }
  const percent = Math.min(100, Math.max(0, Number(input.discountPercent) || 0));
  const discountAmount = round2((standard * percent) / 100);
  return { standard, negotiated: round2(standard - discountAmount), discountAmount, percent };
}

export function paymentState(paid: number, negotiated: number): PartnerPaymentState {
  if (negotiated > 0 && paid >= negotiated - 0.005) return "fully_paid";
  if (paid > 0) return "partially_paid";
  return "unpaid";
}

export function paymentProgress(paid: number, negotiated: number) {
  if (!negotiated) return 0;
  return Math.min(100, Math.max(0, (paid / negotiated) * 100));
}

/** Human-readable validation message, or null when the values are usable. */
export function validatePricing(input: {
  method: PricingMethod;
  standardPrice: number;
  discountPercent: number;
  negotiatedPrice: number;
}) {
  if (!Number.isFinite(input.standardPrice) || input.standardPrice <= 0) {
    return "Enter the standard property price.";
  }
  if (input.method === "discount") {
    if (!Number.isFinite(input.discountPercent) || input.discountPercent < 0) {
      return "The discount cannot be negative.";
    }
    if (input.discountPercent > 100) return "The discount cannot be more than 100%.";
  } else {
    if (!Number.isFinite(input.negotiatedPrice) || input.negotiatedPrice < 0) {
      return "The negotiated price cannot be negative.";
    }
    if (input.negotiatedPrice > input.standardPrice) {
      return "The negotiated price cannot be higher than the standard price.";
    }
  }
  return null;
}
