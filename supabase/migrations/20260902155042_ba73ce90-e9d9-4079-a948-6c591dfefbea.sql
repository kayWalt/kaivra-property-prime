CREATE TABLE public.developer_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_name text NOT NULL,
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text NOT NULL,
  account_last4 text GENERATED ALWAYS AS (right(account_number, 4)) STORED,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT (id, developer_name, bank_name, account_name, account_last4, description, status, archived_at, created_at, updated_at)
  ON public.developer_payment_accounts TO authenticated;
GRANT ALL ON public.developer_payment_accounts TO service_role;

ALTER TABLE public.developer_payment_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active accounts readable, admins see all"
  ON public.developer_payment_accounts FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()) OR (status = 'active' AND archived_at IS NULL));

CREATE TRIGGER developer_payment_accounts_updated
  BEFORE UPDATE ON public.developer_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payment_account_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_account_id uuid REFERENCES public.developer_payment_accounts(id) ON DELETE SET NULL,
  admin_user_id uuid,
  admin_email text,
  action text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_account_audit_log TO authenticated;
GRANT ALL ON public.payment_account_audit_log TO service_role;

ALTER TABLE public.payment_account_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read payment account audit log"
  ON public.payment_account_audit_log FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

ALTER TABLE public.application_payments
  ADD COLUMN payment_account_id uuid REFERENCES public.developer_payment_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN payment_account_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.set_payment_account_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  acct public.developer_payment_accounts%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.payment_account_id := OLD.payment_account_id;
    NEW.payment_account_snapshot := OLD.payment_account_snapshot;
    RETURN NEW;
  END IF;

  IF NEW.payment_account_id IS NULL THEN
    NEW.payment_account_snapshot := NULL;
    RETURN NEW;
  END IF;

  SELECT * INTO acct FROM public.developer_payment_accounts WHERE id = NEW.payment_account_id;
  IF acct.id IS NULL THEN
    RAISE EXCEPTION 'Unknown payment account';
  END IF;
  IF acct.status <> 'active' OR acct.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'This payment account is no longer available';
  END IF;

  NEW.payment_account_snapshot := jsonb_build_object(
    'account_id', acct.id,
    'developer_name', acct.developer_name,
    'bank_name', acct.bank_name,
    'account_name', acct.account_name,
    'masked_account_number', '****' || acct.account_last4,
    'captured_at', now()
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER payments_account_snapshot
  BEFORE INSERT OR UPDATE ON public.application_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_payment_account_snapshot();