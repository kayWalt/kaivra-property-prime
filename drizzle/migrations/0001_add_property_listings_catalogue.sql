CREATE TABLE public.property_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  property_type text NOT NULL,
  listing_type text NOT NULL,
  location text NOT NULL,
  city text,
  state text,
  country text NOT NULL DEFAULT 'Nigeria',
  short_description text,
  description text NOT NULL,
  price numeric,
  price_display_text text,
  currency text NOT NULL DEFAULT 'NGN',
  size_value numeric,
  size_unit text,
  bedrooms integer,
  bathrooms numeric,
  parking_spaces integer,
  property_status text NOT NULL DEFAULT 'available',
  listing_status text NOT NULL DEFAULT 'draft',
  featured boolean NOT NULL DEFAULT false,
  developer_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  latitude numeric,
  longitude numeric,
  key_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_listings_property_type_check CHECK (property_type IN ('land','house','apartment','duplex','villa','commercial','office','shop','warehouse','estate','other')),
  CONSTRAINT property_listings_listing_type_check CHECK (listing_type IN ('sale','rent','lease')),
  CONSTRAINT property_listings_property_status_check CHECK (property_status IN ('available','sold','rented','leased','unavailable','coming_soon')),
  CONSTRAINT property_listings_listing_status_check CHECK (listing_status IN ('draft','published','archived')),
  CONSTRAINT property_listings_price_check CHECK (price IS NULL OR price >= 0),
  CONSTRAINT property_listings_size_check CHECK (size_value IS NULL OR size_value >= 0),
  CONSTRAINT property_listings_bedrooms_check CHECK (bedrooms IS NULL OR bedrooms >= 0),
  CONSTRAINT property_listings_bathrooms_check CHECK (bathrooms IS NULL OR bathrooms >= 0),
  CONSTRAINT property_listings_parking_check CHECK (parking_spaces IS NULL OR parking_spaces >= 0),
  CONSTRAINT property_listings_latitude_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT property_listings_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT property_listings_slug_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT property_listings_published_at_check CHECK ((listing_status = 'published' AND published_at IS NOT NULL) OR listing_status <> 'published')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_listings TO authenticated;
GRANT SELECT (id, title, slug, property_type, listing_type, location, city, state, country, short_description, description, price, price_display_text, currency, size_value, size_unit, bedrooms, bathrooms, parking_spaces, property_status, listing_status, featured, developer_name, contact_name, contact_email, contact_phone, latitude, longitude, key_features, published_at, created_at, updated_at) ON public.property_listings TO anon;
GRANT ALL ON public.property_listings TO service_role;

ALTER TABLE public.property_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property listings public read"
ON public.property_listings FOR SELECT TO anon, authenticated
USING (
  listing_status = 'published'
  AND property_status IN ('available', 'coming_soon')
  OR private.admin_can(auth.uid(), 'property_listings', 'view')
);

CREATE POLICY "property listings staff create"
ON public.property_listings FOR INSERT TO authenticated
WITH CHECK (
  private.admin_can(auth.uid(), 'property_listings', 'create')
  AND created_by = auth.uid()
  AND updated_by = auth.uid()
);

CREATE POLICY "property listings staff edit"
ON public.property_listings FOR UPDATE TO authenticated
USING (private.admin_can(auth.uid(), 'property_listings', 'edit'))
WITH CHECK (
  private.admin_can(auth.uid(), 'property_listings', 'edit')
  AND created_by IS NOT NULL
  AND updated_by = auth.uid()
);

CREATE TABLE public.property_listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
  url text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_listing_images_order_check CHECK (sort_order >= 0),
  CONSTRAINT property_listing_images_url_check CHECK (url ~ '^/api/public/project-image/listing/[A-Za-z0-9][A-Za-z0-9._-]*$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_listing_images TO authenticated;
GRANT SELECT (id, listing_id, url, caption, sort_order, is_cover, created_at) ON public.property_listing_images TO anon;
GRANT ALL ON public.property_listing_images TO service_role;

ALTER TABLE public.property_listing_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property listing images public read"
ON public.property_listing_images FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.property_listings listing
    WHERE listing.id = listing_id
      AND (
        listing.listing_status = 'published'
        AND listing.property_status IN ('available', 'coming_soon')
        OR private.admin_can(auth.uid(), 'property_listings', 'view')
      )
  )
);

CREATE POLICY "property listing images staff create"
ON public.property_listing_images FOR INSERT TO authenticated
WITH CHECK (
  private.admin_can(auth.uid(), 'property_listings', 'edit')
  AND created_by = auth.uid()
);

CREATE POLICY "property listing images staff edit"
ON public.property_listing_images FOR UPDATE TO authenticated
USING (private.admin_can(auth.uid(), 'property_listings', 'edit'))
WITH CHECK (private.admin_can(auth.uid(), 'property_listings', 'edit'));

CREATE POLICY "property listing images staff delete"
ON public.property_listing_images FOR DELETE TO authenticated
USING (private.admin_can(auth.uid(), 'property_listings', 'edit'));

CREATE UNIQUE INDEX property_listing_images_one_cover_idx
ON public.property_listing_images (listing_id)
WHERE is_cover;
CREATE INDEX property_listings_public_catalogue_idx
ON public.property_listings (listing_status, property_status, featured DESC, published_at DESC);
CREATE INDEX property_listings_location_idx
ON public.property_listings (state, city);
CREATE INDEX property_listing_images_listing_order_idx
ON public.property_listing_images (listing_id, sort_order);

CREATE OR REPLACE FUNCTION public.prepare_property_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  IF NEW.listing_status = 'published' AND (TG_OP = 'INSERT' OR OLD.listing_status IS DISTINCT FROM 'published') THEN
    NEW.published_at := now();
    NEW.archived_at := NULL;
  ELSIF NEW.listing_status = 'archived' AND (TG_OP = 'INSERT' OR OLD.listing_status IS DISTINCT FROM 'archived') THEN
    NEW.archived_at := now();
  ELSIF NEW.listing_status <> 'published' THEN
    NEW.published_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prepare_property_listing_before_write
BEFORE INSERT OR UPDATE ON public.property_listings
FOR EACH ROW EXECUTE FUNCTION public.prepare_property_listing();

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
      WHEN OLD.listing_status IS DISTINCT FROM NEW.listing_status THEN 'PROPERTY_LISTING_STATUS_CHANGED'
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

CREATE TRIGGER audit_property_listing_after_write
AFTER INSERT OR UPDATE ON public.property_listings
FOR EACH ROW EXECUTE FUNCTION public.audit_property_listing_change();