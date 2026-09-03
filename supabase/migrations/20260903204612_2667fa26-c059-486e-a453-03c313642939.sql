
-- 1. Payments: pin financial + destination fields for non-staff updates.
CREATE OR REPLACE FUNCTION public.lock_investor_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF private.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  -- Investors may never redirect, re-price or re-parent a payment after insert.
  NEW.application_id := OLD.application_id;
  NEW.payment_account_id := OLD.payment_account_id;
  NEW.payment_account_snapshot := OLD.payment_account_snapshot;
  NEW.payment_reference := OLD.payment_reference;
  NEW.amount := OLD.amount;
  NEW.paid_on := OLD.paid_on;
  NEW.method := OLD.method;
  NEW.bank := OLD.bank;
  NEW.sender := OLD.sender;
  NEW.reference := OLD.reference;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS payments_lock_investor_fields ON public.application_payments;
CREATE TRIGGER payments_lock_investor_fields
BEFORE UPDATE ON public.application_payments
FOR EACH ROW EXECUTE FUNCTION public.lock_investor_payment_fields();

-- Destination must always be an administrator-created, active account at insert time.
CREATE OR REPLACE FUNCTION public.assert_payment_account_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF NEW.payment_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.developer_payment_accounts a
     WHERE a.id = NEW.payment_account_id
       AND a.status = 'active'
       AND a.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This payment account is not available';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS payments_account_allowed ON public.application_payments;
CREATE TRIGGER payments_account_allowed
BEFORE INSERT ON public.application_payments
FOR EACH ROW EXECUTE FUNCTION public.assert_payment_account_allowed();

DROP POLICY IF EXISTS "payments investor update pending" ON public.application_payments;
CREATE POLICY "payments investor update pending"
ON public.application_payments FOR UPDATE TO authenticated
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
  AND (
    payment_account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.developer_payment_accounts a
       WHERE a.id = payment_account_id
    )
  )
);

-- 2. Applications: ownership + assignment fields are staff-only.
CREATE OR REPLACE FUNCTION public.lock_application_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  -- Ownership can never move to another account by client request.
  IF NOT private.is_staff(auth.uid()) THEN
    NEW.investor_id := OLD.investor_id;
    NEW.created_by := OLD.created_by;
    NEW.adviser_id := OLD.adviser_id;
    NEW.project_id := OLD.project_id;
    NEW.property_id := OLD.property_id;
  ELSIF NEW.investor_id IS DISTINCT FROM OLD.investor_id
        AND NOT private.admin_can(auth.uid(), 'applications', 'edit') THEN
    RAISE EXCEPTION 'Only authorised administrators can reassign an application';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS applications_lock_ownership ON public.applications;
CREATE TRIGGER applications_lock_ownership
BEFORE UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.lock_application_ownership();

-- Immutable audit event whenever ownership actually changes.
CREATE OR REPLACE FUNCTION public.audit_application_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF NEW.investor_id IS DISTINCT FROM OLD.investor_id THEN
    INSERT INTO public.admin_audit_events
      (actor, actor_name, actor_role, action, subject_user, entity_type, entity_id, detail)
    VALUES (
      auth.uid(),
      (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
      CASE WHEN private.is_admin(auth.uid()) THEN 'admin' ELSE 'staff' END,
      'APPLICATION_REASSIGNED',
      NEW.investor_id,
      'application',
      NEW.id,
      jsonb_build_object(
        'reference', NEW.reference,
        'previous_owner', OLD.investor_id,
        'new_owner', NEW.investor_id,
        'changed_at', now()
      )
    );
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS applications_audit_reassignment ON public.applications;
CREATE TRIGGER applications_audit_reassignment
AFTER UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.audit_application_reassignment();

DROP POLICY IF EXISTS "applications investor update" ON public.applications;
CREATE POLICY "applications investor update"
ON public.applications FOR UPDATE TO authenticated
USING (
  investor_id = auth.uid()
  AND status = ANY (ARRAY['draft'::application_status, 'requires_correction'::application_status])
)
WITH CHECK (
  investor_id = auth.uid()
  AND created_by IS NOT DISTINCT FROM created_by
  AND status = ANY (ARRAY['draft'::application_status, 'submitted'::application_status])
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);

-- 3. Correction requests: split investor and admin update paths.
DROP POLICY IF EXISTS "Owner responds, admins manage correction requests" ON public.correction_requests;

CREATE POLICY "Investors respond to own correction requests"
ON public.correction_requests FOR UPDATE TO authenticated
USING (
  investor_id = auth.uid()
  AND status = 'additional_info'
)
WITH CHECK (
  investor_id = auth.uid()
  AND status IN ('additional_info', 'under_review')
  AND applied_by IS NOT DISTINCT FROM applied_by
);

CREATE POLICY "Admins manage correction requests"
ON public.correction_requests FOR UPDATE TO authenticated
USING (private.admin_can(auth.uid(), 'corrections', 'resolve'))
WITH CHECK (private.admin_can(auth.uid(), 'corrections', 'resolve'));
