--------------------------------------------------------------------------------
-- Tasks of any kind (owner, 2026-11-25): a free-text details box, an optional
-- free-text "other" link (accountant, office, car), and file attachments kept in
-- the private media bucket (key t/<tenant>/task/<task>/<uuid>). Additive only.
--------------------------------------------------------------------------------
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "details" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "other_label" text;

CREATE TABLE IF NOT EXISTS "task_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "s3_key" text NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "task_attachments_task_idx" ON "task_attachments" ("task_id");

ALTER TABLE "task_attachments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "task_attachments";
CREATE POLICY "tenant_isolation" ON "task_attachments"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_attachments" TO ozirealty_app;
