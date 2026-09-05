# Partner / Adviser / Super Admin property purchase

A small, secure extension of the existing application system — no new application flow, no new tables for applications, payments or documents. Everything reuses the current wizard, payment records, documents and audit history.

## What changes for people

- A new **Partner** role joins the existing roles (Investor, Adviser, Admin, Super Admin). Only a Super Admin can grant it.
- When a Partner, Adviser or Super Admin fills in an application, the Investment step shows an extra clearly marked panel: **KAIVRA Partner / Adviser purchase**, with standard price, pricing method (discount % or negotiated price), discount amount, negotiated price, amount paid, balance and payment progress.
- That application gets its own reference, e.g. `KVP-PARTNER-2026-000001`, shown on the application and searchable.
- Normal investors see exactly what they see today — no partner panel, no partner reference, no discount fields.
- Admin/Super Admin application list gains filters for applicant type (Investor / Partner / Adviser / Super Admin) and payment state (Unpaid / Partially paid / Fully paid), plus partner pricing columns on the detail page.
- Every discount or negotiated-price change is written to the existing audit history with who changed it, the old and new values, and the time.

## Pricing rules

- Discount amount = standard price x discount %
- Negotiated price = standard price − discount amount
- If the negotiated price is entered instead: discount amount = standard − negotiated, discount % = discount amount / standard x 100
- Only one of the two is stored as the source value, so the numbers can never contradict each other.
- Balance = negotiated price − amount paid; progress % = amount paid / negotiated price x 100.
- Amount paid always comes from the existing payment records (never typed as a standalone number), so the current verification workflow is untouched.
- Rejected: negative values, discount above 100%, negotiated price above standard price.

## Database changes (needs your approval)

One migration, additive only:

1. Add `partner` to the existing role list.
2. Add to `applications`: `application_type` (`investor` default / `partner`), `partner_reference` (unique), `pricing_method`, `standard_price`, `discount_percent`, `negotiated_price` (all decimal), `discount_approval` (`pending` default / `approved` / `rejected`), `pricing_set_by`, `pricing_set_at`.
3. A counter + trigger that assigns `KVP-PARTNER-<year>-<000001>` the first time an application is marked as a partner purchase.
4. A guard trigger: only a signed-in Partner / Adviser / Super Admin may set the partner type or any pricing field; for everyone else those fields are forced back to their previous values (or null). The reference itself grants nothing — the role in the database is the only authority.
5. The existing total-value rule is adjusted so a partner application uses the negotiated price rather than the list price; normal investor applications keep today's behaviour byte-for-byte.
6. Pricing changes append a row to the existing `admin_audit_events` history.

No existing rows, payments, documents, policies for investors, or sign-in behaviour are altered.

## Code changes

- `src/lib/kaivra.ts` — add the `partner` role, partner pricing types and the calculation/validation helpers.
- `src/hooks/useAuth.ts` — a `canPartnerPurchase` helper derived from the roles already loaded.
- New `src/components/kaivra/PartnerPricingPanel.tsx` — the pricing panel with the two-way calculator.
- `src/routes/_authenticated/application.tsx` — render the panel inside the Investment step for authorised roles only, and save the pricing to the application.
- `src/routes/_authenticated/admin.applications.index.tsx` — applicant-type and payment-state filters, partner reference in search.
- `src/routes/_authenticated/admin.applications.$appId.tsx` and `applications.$appId.tsx` — show the partner pricing summary and who set it.

## Checks after building

TypeScript check, production build, and role tests: investor sees nothing partner-related and is blocked server-side; partner/adviser/super admin can set either pricing method; the worked examples (100m at 10% → 90m; 90m with 30m paid → 60m balance; 85m negotiated on 100m → 15%) verified.
