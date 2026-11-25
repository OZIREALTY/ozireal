-- Do-now card organising (owner, 2026-11-26): pin, snooze, hide. One row per card
-- key ("enquiry:<id>", "e:<campaign>", "task:<id>", or "subject:<text>" for a whole
-- kind). Only tidies the home screen; the records themselves are never touched.
CREATE TABLE IF NOT EXISTS "today_card_prefs" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "key" text NOT NULL,
  "pinned" boolean NOT NULL DEFAULT false,
  "hidden" boolean NOT NULL DEFAULT false,
  "snoozed_until" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("tenant_id", "key")
);
ALTER TABLE "today_card_prefs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "today_card_prefs";
CREATE POLICY "tenant_isolation" ON "today_card_prefs"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "today_card_prefs" TO ozirealty_app;
