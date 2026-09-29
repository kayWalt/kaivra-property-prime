DROP POLICY IF EXISTS "property listing images staff create" ON public.property_listing_images;
CREATE POLICY "property listing images staff create"
ON public.property_listing_images FOR INSERT TO authenticated
WITH CHECK (
  (private.admin_can(auth.uid(), 'property_listings', 'create') OR private.admin_can(auth.uid(), 'property_listings', 'edit'))
  AND created_by = auth.uid()
);

CREATE OR REPLACE FUNCTION public.save_property_listing(_listing jsonb, _images jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid := NULLIF(_listing->>'id', '')::uuid;
  v_is_create boolean := v_id IS NULL;
  v_image jsonb;
  v_index integer := 0;
  v_cover_count integer := 0;
BEGIN
  IF NOT private.admin_can(auth.uid(), 'property_listings', CASE WHEN v_is_create THEN 'create' ELSE 'edit' END) THEN
    RAISE EXCEPTION 'You do not have permission to perform this action.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_images) <> 'array' OR jsonb_array_length(_images) > 30 THEN
    RAISE EXCEPTION 'The image gallery is invalid.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_cover_count FROM jsonb_array_elements(_images) image WHERE COALESCE((image->>'is_cover')::boolean, false);
  IF v_cover_count > 1 THEN
    RAISE EXCEPTION 'Only one cover image is allowed.' USING ERRCODE = '22023';
  END IF;

  IF v_is_create THEN
    INSERT INTO public.property_listings (
      title, slug, property_type, listing_type, location, city, state, country,
      short_description, description, price, price_display_text, currency,
      size_value, size_unit, bedrooms, bathrooms, parking_spaces,
      property_status, listing_status, featured, developer_name,
      contact_name, contact_email, contact_phone, latitude, longitude,
      key_features, created_by, updated_by
    ) VALUES (
      _listing->>'title', _listing->>'slug', _listing->>'property_type', _listing->>'listing_type',
      _listing->>'location', NULLIF(_listing->>'city',''), NULLIF(_listing->>'state',''), COALESCE(NULLIF(_listing->>'country',''),'Nigeria'),
      NULLIF(_listing->>'short_description',''), _listing->>'description', NULLIF(_listing->>'price','')::numeric,
      NULLIF(_listing->>'price_display_text',''), COALESCE(NULLIF(_listing->>'currency',''),'NGN'), NULLIF(_listing->>'size_value','')::numeric,
      NULLIF(_listing->>'size_unit',''), NULLIF(_listing->>'bedrooms','')::integer, NULLIF(_listing->>'bathrooms','')::numeric,
      NULLIF(_listing->>'parking_spaces','')::integer, _listing->>'property_status', _listing->>'listing_status',
      COALESCE((_listing->>'featured')::boolean,false), NULLIF(_listing->>'developer_name',''), NULLIF(_listing->>'contact_name',''),
      NULLIF(_listing->>'contact_email',''), NULLIF(_listing->>'contact_phone',''), NULLIF(_listing->>'latitude','')::numeric,
      NULLIF(_listing->>'longitude','')::numeric, COALESCE(_listing->'key_features','[]'::jsonb), auth.uid(), auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.property_listings SET
      title=_listing->>'title', slug=_listing->>'slug', property_type=_listing->>'property_type', listing_type=_listing->>'listing_type',
      location=_listing->>'location', city=NULLIF(_listing->>'city',''), state=NULLIF(_listing->>'state',''), country=COALESCE(NULLIF(_listing->>'country',''),'Nigeria'),
      short_description=NULLIF(_listing->>'short_description',''), description=_listing->>'description', price=NULLIF(_listing->>'price','')::numeric,
      price_display_text=NULLIF(_listing->>'price_display_text',''), currency=COALESCE(NULLIF(_listing->>'currency',''),'NGN'),
      size_value=NULLIF(_listing->>'size_value','')::numeric, size_unit=NULLIF(_listing->>'size_unit',''), bedrooms=NULLIF(_listing->>'bedrooms','')::integer,
      bathrooms=NULLIF(_listing->>'bathrooms','')::numeric, parking_spaces=NULLIF(_listing->>'parking_spaces','')::integer,
      property_status=_listing->>'property_status', listing_status=_listing->>'listing_status', featured=COALESCE((_listing->>'featured')::boolean,false),
      developer_name=NULLIF(_listing->>'developer_name',''), contact_name=NULLIF(_listing->>'contact_name',''), contact_email=NULLIF(_listing->>'contact_email',''),
      contact_phone=NULLIF(_listing->>'contact_phone',''), latitude=NULLIF(_listing->>'latitude','')::numeric, longitude=NULLIF(_listing->>'longitude','')::numeric,
      key_features=COALESCE(_listing->'key_features','[]'::jsonb), updated_by=auth.uid()
    WHERE id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Property listing not found.' USING ERRCODE = 'P0002'; END IF;
    DELETE FROM public.property_listing_images WHERE listing_id=v_id;
  END IF;

  FOR v_image IN SELECT value FROM jsonb_array_elements(_images)
  LOOP
    IF COALESCE(v_image->>'url','') !~ '^/api/public/project-image/listing/[A-Za-z0-9][A-Za-z0-9._-]*$' THEN
      RAISE EXCEPTION 'An image path is invalid.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.property_listing_images (listing_id,url,caption,sort_order,is_cover,created_by)
    VALUES (v_id,v_image->>'url',NULLIF(v_image->>'caption',''),v_index,COALESCE((v_image->>'is_cover')::boolean,false),auth.uid());
    v_index := v_index + 1;
  END LOOP;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_property_listing(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_property_listing(jsonb,jsonb) TO authenticated, service_role;