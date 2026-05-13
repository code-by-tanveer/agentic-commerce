-- 0002_message_status.sql — polish-round-2 T2.1.
-- Add a `status` column to messages so the BE can mark assistant turns
-- `truncated` on abort/error vs `done` on clean finish. Existing rows
-- default to 'done'. ADR-0002 persistence is now BE-owned (see agent.ts).

ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'done';
