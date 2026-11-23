--------------------------------------------------------------------------------
-- Interaction corrections (owner, 2026-11-23: "edit" on each log entry).
--
-- The log stays append-only (§4: "Immutable; corrections are new rows"). An edit
-- inserts a NEW row whose corrects_id points at the version it replaces. Readers
-- skip any row that a later row corrects, so the log, the AI brief and the counts
-- see only the current version, while every earlier version remains as evidence.
--
-- corrects_id is set once, at insert, and is added to the frozen columns below so a
-- correction cannot be re-pointed afterwards. The function is otherwise identical
-- to the 0008 version.
--------------------------------------------------------------------------------
ALTER TABLE "interactions"
  ADD COLUMN IF NOT EXISTS "corrects_id" uuid REFERENCES "interactions"("id");

-- One correction per version: editing again corrects the newest version, never
-- forks the history.
CREATE UNIQUE INDEX IF NOT EXISTS "interactions_corrects_uq"
  ON "interactions" ("corrects_id") WHERE "corrects_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION interactions_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'interactions is append-only: delete is not permitted (id=%)', OLD.id
      USING HINT = 'Set tombstoned_at instead, for a privacy request.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'interactions: the primary key is immutable (id=%)', OLD.id;
  END IF;

  -- A tombstone is one-way: null -> timestamp only.
  IF OLD.tombstoned_at IS NOT NULL AND NEW.tombstoned_at IS DISTINCT FROM OLD.tombstoned_at THEN
    RAISE EXCEPTION 'interactions: a tombstone cannot be reversed or altered (id=%)', OLD.id
      USING HINT = 'A privacy deletion is final.';
  END IF;

  -- Everything evidentiary is frozen. ai_summary is deliberately absent: it is
  -- derived FROM the frozen body, and a stale derivation must be replaceable.
  IF (NEW.tenant_id, NEW.contact_id, NEW.channel, NEW.direction, NEW.occurred_at,
      NEW.subject, NEW.body, NEW.raw_s3_key, NEW.thread_ref, NEW.message_id,
      NEW.listing_id, NEW.created_by_user_id, NEW.created_at, NEW.corrects_id)
     IS DISTINCT FROM
     (OLD.tenant_id, OLD.contact_id, OLD.channel, OLD.direction, OLD.occurred_at,
      OLD.subject, OLD.body, OLD.raw_s3_key, OLD.thread_ref, OLD.message_id,
      OLD.listing_id, OLD.created_by_user_id, OLD.created_at, OLD.corrects_id)
  THEN
    RAISE EXCEPTION 'interactions is append-only: only tombstoned_at may change (id=%)', OLD.id
      USING HINT = 'Record a correction as a NEW interaction row.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
