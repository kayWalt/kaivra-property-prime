REVOKE SELECT (contact_name, contact_email, contact_phone) ON public.property_listings FROM anon;

CREATE OR REPLACE FUNCTION public.audit_property_listing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_entity_id uuid;
  v_detail jsonb;
BEGIN
  v_entity_id := COALESCE(NEW.id, OLD.id);
  IF TG_OP = 'INSERT' THEN
    v_action := 'PROPERTY_LISTING_CREATED';
    v_detail := jsonb_build_object('title', NEW.title, 'listing_status', NEW.listing_status, 'property_status', NEW.property_status);
  ELSE
    v_action := CASE
      WHEN OLD.listing_status IS DISTINCT FROM NEW.listing_status AND NEW.listing_status = 'published' THEN 'PROPERTY_LISTING_PUBLISHED'
      WHEN OLD.listing_status IS DISTINCT FROM NEW.listing_status AND OLD.listing_status = 'published' THEN 'PROPERTY_LISTING_UNPUBLISHED'
      WHEN OLD.listing_status IS DISTINCT FROM NEW.listing_status AND NEW.listing_status = 'archived' THEN 'PROPERTY_LISTING_ARCHIVED'
      WHEN OLD.price IS DISTINCT FROM NEW.price OR OLD.price_display_text IS DISTINCT FROM NEW.price_display_text THEN 'PROPERTY_LISTING_PRICE_CHANGED'
      WHEN OLD.property_status IS DISTINCT FROM NEW.property_status THEN 'PROPERTY_LISTING_AVAILABILITY_CHANGED'
      WHEN OLD.featured IS DISTINCT FROM NEW.featured THEN 'PROPERTY_LISTING_FEATURED_CHANGED'
      ELSE 'PROPERTY_LISTING_EDITED'
    END;
    v_detail := jsonb_build_object(
      'title', NEW.title,
      'previous_listing_status', OLD.listing_status,
      'listing_status', NEW.listing_status,
      'previous_property_status', OLD.property_status,
      'property_status', NEW.property_status,
      'previous_price', OLD.price,
      'price', NEW.price,
      'featured', NEW.featured
    );
  END IF;
  INSERT INTO public.admin_audit_events (actor, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), v_action, 'property_listing', v_entity_id, v_detail);
  RETURN COALESCE(NEW, OLD);
END;
$$;