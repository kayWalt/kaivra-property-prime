import { useState } from "react";
import { Handshake } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNaira, ROLE_LABEL, type AppRole } from "@/lib/kaivra";
import {
  APPROVAL_LABEL,
  PAYMENT_STATE_LABEL,
  derivePricing,
  paymentProgress,
  paymentState,
  validatePricing,
  type DiscountApproval,
  type PricingMethod,
} from "@/lib/partner-pricing";

export interface PartnerDraft {
  enabled: boolean;
  pricing_method: PricingMethod;
  standard_price: number;
  discount_percent: number;
  negotiated_price: number;
}

export const EMPTY_PARTNER_DRAFT: PartnerDraft = {
  enabled: false,
  pricing_method: "discount",
  standard_price: 0,
  discount_percent: 0,
  negotiated_price: 0,
};

/**
 * Partner / Adviser / Super Admin purchase pricing. Rendered only for roles the
 * database recognises as partner buyers; the same rules are enforced again by
 * the applications pricing trigger, so hiding this panel is never the only
 * control.
 */
export function PartnerPricingPanel(props: {
  value: PartnerDraft;
  onChange: (next: PartnerDraft) => void;
  role: AppRole;
  applicant: string;
  propertyName: string;
  listPrice: number;
  paid: number;
  reference: string | null;
  approval: DiscountApproval;
  pricingSetBy?: string | null;
  disabled?: boolean;
}) {
  const v = props.value;
  const derived = derivePricing({
    method: v.pricing_method,
    standardPrice: v.standard_price,
    discountPercent: v.discount_percent,
    negotiatedPrice: v.negotiated_price,
  });
  const error = v.enabled
    ? validatePricing({
        method: v.pricing_method,
        standardPrice: v.standard_price,
        discountPercent: v.discount_percent,
        negotiatedPrice: v.negotiated_price,
      })
    : null;
  const balance = Math.max(0, derived.negotiated - props.paid);
  const state = paymentState(props.paid, derived.negotiated);
  const progress = paymentProgress(props.paid, derived.negotiated);

  function patch(next: Partial<PartnerDraft>) {
    props.onChange({ ...v, ...next });
  }

  return (
    <section className="rounded-lg border border-primary/40 bg-primary/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Handshake className="mt-0.5 size-5 text-primary" aria-hidden />
          <div>
            <p className="eyebrow text-primary">KAIVRA Partner / Adviser purchase</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Record a negotiated purchase price agreed with the developer. Nothing here is applied
              to a normal investor application.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="partner-mode" className="text-sm">
            Partner purchase
          </Label>
          <Switch
            id="partner-mode"
            checked={v.enabled}
            disabled={props.disabled}
            onCheckedChange={(checked) =>
              patch({
                enabled: checked,
                standard_price: v.standard_price || props.listPrice,
              })
            }
          />
        </div>
      </div>

      {v.enabled ? (
        <div className="mt-6 space-y-6">
          <dl className="grid gap-3 sm:grid-cols-3">
            <Field label="Application reference" value={props.reference ?? "Assigned on save"} />
            <Field label="Applicant" value={props.applicant || "—"} />
            <Field label="Role" value={ROLE_LABEL[props.role]} />
            <Field label="Property" value={props.propertyName || "—"} />
            <Field label="Discount approval" value={APPROVAL_LABEL[props.approval]} />
            <Field label="Pricing entered by" value={props.pricingSetBy ?? "—"} />
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="standard-price">Standard property price (₦)</Label>
              <Input
                id="standard-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                disabled={props.disabled}
                value={v.standard_price || ""}
                onChange={(e) => patch({ standard_price: Math.max(0, Number(e.target.value) || 0) })}
                className="mt-1.5"
              />
            </div>
            <div>
              <p className="text-sm font-medium">Pricing method</p>
              <div className="mt-2 flex gap-4">
                {(
                  [
                    ["discount", "Discount %"],
                    ["negotiated", "Negotiated price"],
                  ] as [PricingMethod, string][]
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="pricing-method"
                      value={value}
                      checked={v.pricing_method === value}
                      disabled={props.disabled}
                      onChange={() =>
                        patch({
                          pricing_method: value,
                          discount_percent: derived.percent,
                          negotiated_price: derived.negotiated,
                        })
                      }
                      className="size-4 accent-[hsl(var(--primary))]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {v.pricing_method === "discount" ? (
              <div>
                <Label htmlFor="discount-percent">Partner discount (%)</Label>
                <Input
                  id="discount-percent"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.01"
                  disabled={props.disabled}
                  value={v.discount_percent || ""}
                  onChange={(e) =>
                    patch({
                      discount_percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                  className="mt-1.5"
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="negotiated-price">Negotiated purchase price (₦)</Label>
                <Input
                  id="negotiated-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  disabled={props.disabled}
                  value={v.negotiated_price || ""}
                  onChange={(e) =>
                    patch({ negotiated_price: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1.5"
                />
              </div>
            )}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <dl className="grid gap-3 sm:grid-cols-3">
            <Field label="Discount amount" value={formatNaira(derived.discountAmount)} />
            <Field
              label="Discount"
              value={`${derived.percent.toLocaleString("en-NG", { maximumFractionDigits: 2 })}%`}
            />
            <Field label="Negotiated purchase price" value={formatNaira(derived.negotiated)} />
            <Field label="Amount paid" value={formatNaira(props.paid)} />
            <Field label="Balance" value={formatNaira(balance)} />
            <div className="rounded-md border border-border bg-background px-4 py-3">
              <dt className="eyebrow text-muted-foreground">Payment status</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm font-medium">
                <Badge variant={state === "fully_paid" ? "default" : "secondary"}>
                  {PAYMENT_STATE_LABEL[state]}
                </Badge>
                <span className="text-muted-foreground">
                  {progress.toLocaleString("en-NG", { maximumFractionDigits: 1 })}%
                </span>
              </dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground">
            Amount paid comes from the recorded payments on this application, so the existing
            verification steps are unchanged. The discount you enter is recorded exactly as typed
            and stays pending until it is approved.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-4 py-3">
      <dt className="eyebrow text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words">{value}</dd>
    </div>
  );
}
