/*
# Migration 045: Platform ads (login page carousel)

Banner ads managed by the Veducore team in /superadmin/ads and shown as a
fading, clickable carousel at the bottom of the login page.

- `platform_ads`        one row per banner (image, link, schedule, order)
- `is_veducore_manager()` true for active veducore_admins with role owner/admin
- `track_ad_event()`    anonymous-safe impression / click counter
- storage bucket `ads`  public banner images; only managers can write

Superadmin writes go straight through RLS with the portal's own Supabase
session, so no edge function deploy is needed. Idempotent.
*/

-- ------------------------------------------------------------
-- 1. Who may manage ads
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_veducore_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM veducore_admins
    WHERE id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION is_veducore_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_veducore_manager() TO anon, authenticated;

-- ------------------------------------------------------------
-- 2. Table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_ads (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  image_url   text        NOT NULL,
  image_path  text,
  link_url    text,
  placement   text        NOT NULL DEFAULT 'login',
  is_active   boolean     NOT NULL DEFAULT true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  sort_order  integer     NOT NULL DEFAULT 0,
  impressions bigint      NOT NULL DEFAULT 0,
  clicks      bigint      NOT NULL DEFAULT 0,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE platform_ads ADD CONSTRAINT platform_ads_placement_check
    CHECK (placement IN ('login'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE platform_ads ADD CONSTRAINT platform_ads_link_check
    CHECK (link_url IS NULL OR link_url ~* '^(https?://|mailto:|tel:)');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE platform_ads ADD CONSTRAINT platform_ads_dates_check
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS platform_ads_live_idx
  ON platform_ads (placement, sort_order) WHERE is_active;

CREATE OR REPLACE FUNCTION platform_ads_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS platform_ads_touch ON platform_ads;
CREATE TRIGGER platform_ads_touch BEFORE UPDATE ON platform_ads
  FOR EACH ROW EXECUTE FUNCTION platform_ads_touch();

-- ------------------------------------------------------------
-- 3. RLS
-- ------------------------------------------------------------
ALTER TABLE platform_ads ENABLE ROW LEVEL SECURITY;

-- Everyone (incl. logged-out visitors on the login page) sees live ads only.
DROP POLICY IF EXISTS platform_ads_public_read ON platform_ads;
CREATE POLICY platform_ads_public_read ON platform_ads
  FOR SELECT TO anon, authenticated
  USING (
    is_active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >  now())
  );

-- Managers see and change everything.
DROP POLICY IF EXISTS platform_ads_manager_all ON platform_ads;
CREATE POLICY platform_ads_manager_all ON platform_ads
  FOR ALL TO authenticated
  USING (is_veducore_manager())
  WITH CHECK (is_veducore_manager());

GRANT SELECT ON platform_ads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_ads TO authenticated;

-- ------------------------------------------------------------
-- 4. Impression / click counter (callable while logged out)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION track_ad_event(p_ad_id uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kind = 'impression' THEN
    UPDATE platform_ads SET impressions = impressions + 1
     WHERE id = p_ad_id AND is_active;
  ELSIF p_kind = 'click' THEN
    UPDATE platform_ads SET clicks = clicks + 1
     WHERE id = p_ad_id AND is_active;
  END IF;
END $$;

REVOKE ALL ON FUNCTION track_ad_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION track_ad_event(uuid, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 5. Storage bucket for banner images
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ads', 'ads', true, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS ads_public_read ON storage.objects;
CREATE POLICY ads_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'ads');

DROP POLICY IF EXISTS ads_manager_insert ON storage.objects;
CREATE POLICY ads_manager_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ads' AND is_veducore_manager());

DROP POLICY IF EXISTS ads_manager_update ON storage.objects;
CREATE POLICY ads_manager_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ads' AND is_veducore_manager())
  WITH CHECK (bucket_id = 'ads' AND is_veducore_manager());

DROP POLICY IF EXISTS ads_manager_delete ON storage.objects;
CREATE POLICY ads_manager_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ads' AND is_veducore_manager());
