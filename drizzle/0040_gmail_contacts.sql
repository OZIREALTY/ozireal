--------------------------------------------------------------------------------
-- Gmail contacts check (owner-approved, 2026-11-27): Google Contacts (read-only,
-- People API) compared with the CRM every second Monday and on demand. Nothing is
-- added to the CRM from here without the owner's tick, and nobody added this way
-- gets marketing consent.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "gmail_contact_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "trigger" text NOT NULL CHECK ("trigger" IN ('auto', 'manual')),
  "status" text NOT NULL DEFAULT 'running' CHECK ("status" IN ('running', 'done', 'failed')),
  "step" text,
  "totals" jsonb,
  "error" text,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "gmail_contact_runs_tenant_idx" ON "gmail_contact_runs" ("tenant_id", "started_at" DESC);

CREATE TABLE IF NOT EXISTS "gmail_contact_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "resource_name" text NOT NULL,
  "etag" text,
  "kind" text NOT NULL CHECK ("kind" IN ('new', 'duplicate', 'extra')),
  "status" text NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'added', 'skipped', 'done')),
  "name" text NOT NULL,
  "emails" text[] NOT NULL DEFAULT '{}',
  "phones" text[] NOT NULL DEFAULT '{}',
  "crm_contact_id" uuid REFERENCES "contacts"("id") ON DELETE CASCADE,
  "extra" jsonb,
  "suggested_role" text,
  "role_reason" text,
  "first_seen" timestamptz NOT NULL DEFAULT now(),
  "last_seen" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenant_id", "resource_name", "kind")
);
CREATE INDEX IF NOT EXISTS "gmail_contact_items_open_idx" ON "gmail_contact_items" ("tenant_id", "status", "kind");

ALTER TABLE "gmail_contact_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gmail_contact_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "gmail_contact_runs";
CREATE POLICY "tenant_isolation" ON "gmail_contact_runs" USING ("tenant_id" = current_tenant_id()) WITH CHECK ("tenant_id" = current_tenant_id());
DROP POLICY IF EXISTS "tenant_isolation" ON "gmail_contact_items";
CREATE POLICY "tenant_isolation" ON "gmail_contact_items" USING ("tenant_id" = current_tenant_id()) WITH CHECK ("tenant_id" = current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "gmail_contact_runs" TO ozirealty_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "gmail_contact_items" TO ozirealty_app;
