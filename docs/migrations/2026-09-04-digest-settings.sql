-- Daily digest + email settings migration (2026-09-04).
-- Additive only; safe to run once on the production database.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS digest_hour_utc integer NOT NULL DEFAULT 13;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notification_email text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_digest_at timestamptz;
