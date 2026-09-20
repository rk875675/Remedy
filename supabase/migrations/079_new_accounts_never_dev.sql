-- New accounts must never land as is_dev. handle_new_user omitted the column, so
-- whatever the column default was (migration 011 briefly set it to true) applied.
-- is_dev is a manual, service-role-only flag.

ALTER TABLE public.profiles ALTER COLUMN is_dev SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, is_dev)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.email,
    false
  );

  INSERT INTO public.entitlements (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;
