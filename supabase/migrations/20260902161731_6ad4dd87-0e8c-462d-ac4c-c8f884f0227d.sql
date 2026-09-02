-- 1. Remove the admin-gated account-number lookup routine: reveal now happens
--    server-side after an explicit role check, so no elevated database routine
--    is callable by signed-in users.
DROP FUNCTION IF EXISTS public.admin_payment_account_number(uuid);

-- 2. Withhold the full bank account number from every client role. Only the
--    masked last four digits remain readable; writes stay possible so admins
--    can still add or correct an account through the app.
REVOKE ALL ON public.developer_payment_accounts FROM anon;
REVOKE SELECT ON public.developer_payment_accounts FROM authenticated;

GRANT SELECT (
  id, developer_name, bank_name, account_name, account_last4, description,
  status, archived_at, created_by, created_at, updated_by, updated_at
) ON public.developer_payment_accounts TO authenticated;

GRANT INSERT (
  developer_name, bank_name, account_name, account_number, description,
  status, archived_at
) ON public.developer_payment_accounts TO authenticated;

GRANT UPDATE (
  developer_name, bank_name, account_name, account_number, description,
  status, archived_at
) ON public.developer_payment_accounts TO authenticated;

GRANT ALL ON public.developer_payment_accounts TO service_role;