CREATE TABLE public.visitor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  visitor_id text NOT NULL,
  user_id uuid,
  is_authenticated boolean NOT NULL DEFAULT false,
  is_returning boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  page_views integer NOT NULL DEFAULT 0,
  entry_page text,
  exit_page text,
  referrer text,
  device_category text,
  browser text,
  os text,
  screen_class text,
  country text,
  region text,
  locale text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visitor_sessions_started_idx ON public.visitor_sessions (started_at DESC);
CREATE INDEX visitor_sessions_visitor_idx ON public.visitor_sessions (visitor_id, started_at DESC);
CREATE INDEX visitor_sessions_user_idx ON public.visitor_sessions (user_id, started_at DESC);
GRANT ALL ON public.visitor_sessions TO service_role;
ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor uuid,
  actor_role text,
  actor_label text,
  event_type text NOT NULL,
  event_category text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  result text NOT NULL DEFAULT 'success',
  resource_type text,
  resource_id uuid,
  route text,
  session_id text,
  visitor_id text,
  device_category text,
  browser text,
  os text,
  country text,
  locale text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_events_time_idx ON public.activity_events (occurred_at DESC);
CREATE INDEX activity_events_actor_idx ON public.activity_events (actor, occurred_at DESC);
CREATE INDEX activity_events_category_idx ON public.activity_events (event_category, occurred_at DESC);
CREATE INDEX activity_events_severity_idx ON public.activity_events (severity, occurred_at DESC);
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.analytics_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  visitor_retention_days integer NOT NULL DEFAULT 180,
  activity_retention_days integer NOT NULL DEFAULT 365,
  security_retention_days integer NOT NULL DEFAULT 1095,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.analytics_settings TO service_role;
ALTER TABLE public.analytics_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.analytics_settings (id) VALUES (true);

CREATE TRIGGER visitor_sessions_updated BEFORE UPDATE ON public.visitor_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER analytics_settings_updated BEFORE UPDATE ON public.analytics_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Append-only: even the service role cannot silently rewrite history.
CREATE OR REPLACE FUNCTION public.block_activity_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'activity_events is append-only';
END; $$;
CREATE TRIGGER activity_events_append_only
  BEFORE UPDATE OR DELETE ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.block_activity_event_mutation();