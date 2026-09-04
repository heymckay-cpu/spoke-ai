-- Journal + wheel lifecycle migration (2026-09-01).
-- Additive only; safe to run once on the production database.
-- Either run `pnpm --filter @workspace/db run push` (interactive) or execute
-- this file's statements directly.

ALTER TABLE positions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'csp';
ALTER TABLE positions ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS holding_id integer REFERENCES holdings(id) ON DELETE SET NULL;

ALTER TABLE holdings ADD COLUMN IF NOT EXISTS source_position_id integer;

CREATE TABLE IF NOT EXISTS journal_entries (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  decision text NOT NULL,
  ticker text NOT NULL,
  strike double precision NOT NULL,
  expiry text NOT NULL,
  bid double precision NOT NULL,
  annualized_pct double precision,
  delta double precision,
  iv_rank double precision,
  quiver_score double precision,
  snapshot jsonb NOT NULL,
  position_id integer REFERENCES positions(id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  evaluated_at timestamptz,
  outcome_pnl double precision,
  outcome_note text
);

CREATE INDEX IF NOT EXISTS journal_entries_user_idx ON journal_entries (user_id);
