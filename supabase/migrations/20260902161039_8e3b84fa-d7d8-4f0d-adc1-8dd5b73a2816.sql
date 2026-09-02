-- 1. BEFORE trigger: only stamp fields
CREATE OR REPLACE FUNCTION public.stamp_payment_account_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END; $$;

-- 2. AFTER trigger: write the immutable audit row (row now exists, FK satisfied)
CREATE OR REPLACE FUNCTION public.audit_payment_account_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_action text;
  v_email text;
  v_prev jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'account_created';
  ELSE
    IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
      v_action := 'account_archived';
    ELSIF NEW.archived_at IS NULL AND OLD.archived_at IS NOT NULL THEN
      v_action := 'account_restored';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action := CASE WHEN NEW.status = 'active' THEN 'account_activated' ELSE 'account_deactivated' END;
    ELSE
      v_action := 'account_edited';
    END IF;
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();

  v_new := jsonb_build_object(
    'developer_name', NEW.developer_name,
    'bank_name', NEW.bank_name,
    'account_name', NEW.account_name,
    'masked_account_number', '****' || right(NEW.account_number, 4),
    'description', NEW.description,
    'status', NEW.status,
    'archived_at', NEW.archived_at
  );
  IF TG_OP = 'UPDATE' THEN
    v_prev := jsonb_build_object(
      'developer_name', OLD.developer_name,
      'bank_name', OLD.bank_name,
      'account_name', OLD.account_name,
      'masked_account_number', '****' || right(OLD.account_number, 4),
      'description', OLD.description,
      'status', OLD.status,
      'archived_at', OLD.archived_at
    );
  END IF;

  INSERT INTO public.payment_account_audit_log
    (payment_account_id, admin_user_id, admin_email, action, previous_values, new_values)
  VALUES (NEW.id, auth.uid(), v_email, v_action, v_prev, v_new);

  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS developer_payment_accounts_audit ON public.developer_payment_accounts;

CREATE TRIGGER developer_payment_accounts_stamp
BEFORE INSERT OR UPDATE ON public.developer_payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.stamp_payment_account_actor();

CREATE TRIGGER developer_payment_accounts_audit
AFTER INSERT OR UPDATE ON public.developer_payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.audit_payment_account_change();