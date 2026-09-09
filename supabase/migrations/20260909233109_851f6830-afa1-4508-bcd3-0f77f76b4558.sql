CREATE OR REPLACE FUNCTION private.application_pricing_unchanged(
  _id uuid,
  _application_type text,
  _pricing_method text,
  _standard_price numeric,
  _discount_percent numeric,
  _negotiated_price numeric,
  _discount_approval text,
  _pricing_set_by uuid,
  _pricing_set_at timestamptz,
  _partner_reference text,
  _adviser_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE
    WHEN private.is_staff(auth.uid()) THEN true
    WHEN private.is_partner_buyer(auth.uid()) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = _id
        AND a.application_type  IS NOT DISTINCT FROM _application_type
        AND a.pricing_method    IS NOT DISTINCT FROM _pricing_method
        AND a.standard_price    IS NOT DISTINCT FROM _standard_price
        AND a.discount_percent  IS NOT DISTINCT FROM _discount_percent
        AND a.negotiated_price  IS NOT DISTINCT FROM _negotiated_price
        AND a.discount_approval IS NOT DISTINCT FROM _discount_approval
        AND a.pricing_set_by    IS NOT DISTINCT FROM _pricing_set_by
        AND a.pricing_set_at    IS NOT DISTINCT FROM _pricing_set_at
        AND a.partner_reference IS NOT DISTINCT FROM _partner_reference
        AND a.adviser_id        IS NOT DISTINCT FROM _adviser_id
    )
  END;
$$;

CREATE OR REPLACE FUNCTION private.payment_financials_unchanged(
  _id uuid,
  _application_id uuid,
  _amount numeric,
  _paid_on date,
  _method payment_method,
  _bank text,
  _sender text,
  _reference text,
  _payment_reference text,
  _payment_account_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE
    WHEN private.is_staff(auth.uid()) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.application_payments p
      WHERE p.id = _id
        AND p.application_id     IS NOT DISTINCT FROM _application_id
        AND p.amount             IS NOT DISTINCT FROM _amount
        AND p.paid_on            IS NOT DISTINCT FROM _paid_on
        AND p.method             IS NOT DISTINCT FROM _method
        AND p.bank               IS NOT DISTINCT FROM _bank
        AND p.sender             IS NOT DISTINCT FROM _sender
        AND p.reference          IS NOT DISTINCT FROM _reference
        AND p.payment_reference  IS NOT DISTINCT FROM _payment_reference
        AND p.payment_account_id IS NOT DISTINCT FROM _payment_account_id
    )
  END;
$$;

DROP POLICY "applications investor update" ON public.applications;
CREATE POLICY "applications investor update" ON public.applications
FOR UPDATE
USING (
  investor_id = auth.uid()
  AND status = ANY (ARRAY['draft'::application_status, 'requires_correction'::application_status])
)
WITH CHECK (
  investor_id = auth.uid()
  AND status = ANY (ARRAY['draft'::application_status, 'submitted'::application_status])
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND private.application_pricing_unchanged(
    id, application_type, pricing_method, standard_price, discount_percent,
    negotiated_price, discount_approval, pricing_set_by, pricing_set_at,
    partner_reference, adviser_id
  )
);

DROP POLICY "payments investor update pending" ON public.application_payments;
CREATE POLICY "payments investor update pending" ON public.application_payments
FOR UPDATE
USING (
  private.can_view_application(application_id)
  AND NOT private.is_staff(auth.uid())
  AND status = 'pending'::payment_status
)
WITH CHECK (
  private.can_view_application(application_id)
  AND status = 'pending'::payment_status
  AND verified_by IS NULL
  AND verified_at IS NULL
  AND rejection_reason IS NULL
  AND (payment_account_id IS NULL OR EXISTS (
    SELECT 1 FROM public.developer_payment_accounts a WHERE a.id = application_payments.payment_account_id
  ))
  AND private.payment_financials_unchanged(
    id, application_id, amount, paid_on, method, bank, sender, reference,
    payment_reference, payment_account_id
  )
);