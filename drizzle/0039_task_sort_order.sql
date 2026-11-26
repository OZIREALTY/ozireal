-- Hand order within a priority column on the Tasks board (owner, 2026-11-26).
-- Null = never arranged; those sort after arranged ones, by due date.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "sort_order" integer;
