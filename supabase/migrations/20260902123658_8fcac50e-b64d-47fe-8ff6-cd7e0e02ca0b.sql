
DROP POLICY IF EXISTS "payments update" ON public.application_payments;

CREATE POLICY "payments staff update" ON public.application_payments
FOR UPDATE TO authenticated
USING (private.is_staff(auth.uid()) AND private.can_view_application(application_id))
WITH CHECK (private.is_staff(auth.uid()) AND private.can_view_application(application_id));

CREATE POLICY "payments investor update pending" ON public.application_payments
FOR UPDATE TO authenticated
USING (
  private.can_view_application(application_id)
  AND NOT private.is_staff(auth.uid())
  AND status = 'pending'
)
WITH CHECK (
  private.can_view_application(application_id)
  AND status = 'pending'
  AND verified_by IS NULL
  AND verified_at IS NULL
  AND rejection_reason IS NULL
);

DROP POLICY IF EXISTS "applications investor update" ON public.applications;

CREATE POLICY "applications investor update" ON public.applications
FOR UPDATE TO authenticated
USING (
  investor_id = auth.uid()
  AND status = ANY (ARRAY['draft'::application_status, 'requires_correction'::application_status])
)
WITH CHECK (
  investor_id = auth.uid()
  AND status = ANY (ARRAY['draft'::application_status, 'submitted'::application_status])
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);
