ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_preference text NOT NULL DEFAULT 'system';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_theme_preference_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_theme_preference_check
      CHECK (theme_preference IN ('light','dark','system'));
  END IF;
END $$;