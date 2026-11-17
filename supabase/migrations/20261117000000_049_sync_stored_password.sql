-- 049: keep the stored teacher/parent password (shown on the admin's
-- credentials card) in sync when users change their own password.
-- Only writes when p_password really is the caller's current Auth password,
-- so it cannot be used to plant a fake value.
CREATE OR REPLACE FUNCTION public.sync_my_stored_password(p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_password IS NULL OR length(p_password) < 6 THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
  ) THEN
    RETURN;
  END IF;
  UPDATE public.teachers SET password = p_password WHERE user_id = auth.uid();
  UPDATE public.parents  SET password = p_password WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.sync_my_stored_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_my_stored_password(text) TO authenticated;
