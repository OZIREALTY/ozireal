-- Task priority (owner, 2026-11-26): 1 High, 2 Normal (default), 3 Low.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "priority" smallint NOT NULL DEFAULT 2;
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_priority_check";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_check" CHECK ("priority" IN (1, 2, 3));
