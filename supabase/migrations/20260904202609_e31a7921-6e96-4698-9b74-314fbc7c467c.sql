-- 1. application_events: pin actor identity on insert
DROP POLICY IF EXISTS "events insert" ON public.application_events;
CREATE POLICY "events insert" ON public.application_events
  FOR INSERT TO authenticated
  WITH CHECK (
    private.can_view_application(application_id)
    AND (
      private.is_staff(auth.uid())
      OR actor IS NOT DISTINCT FROM auth.uid()
    )
  );

-- 2. application_payments: no self-verified payments on insert
DROP POLICY IF EXISTS "payments write" ON public.application_payments;
CREATE POLICY "payments write" ON public.application_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    private.can_view_application(application_id)
    AND (
      private.is_staff(auth.uid())
      OR (
        status = 'pending'::payment_status
        AND verified_by IS NULL
        AND verified_at IS NULL
        AND rejection_reason IS NULL
      )
    )
  );

-- 3. developer_payment_accounts: only staff/admins and users who actually have
-- an application may read the developer bank details.
DROP POLICY IF EXISTS "Active accounts readable, admins see all" ON public.developer_payment_accounts;
CREATE POLICY "Active accounts readable, admins see all" ON public.developer_payment_accounts
  FOR SELECT TO authenticated
  USING (
    private.admin_view('payment_accounts')
    OR (
      status = 'active'
      AND archived_at IS NULL
      AND (
        private.is_staff(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.applications a
           WHERE a.investor_id = auth.uid()
              OR a.created_by = auth.uid()
              OR a.adviser_id = auth.uid()
        )
      )
    )
  );