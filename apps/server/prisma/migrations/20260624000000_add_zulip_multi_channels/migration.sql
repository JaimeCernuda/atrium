-- CREATE-ONLY: applied via `prisma migrate deploy` at release, NOT against the live DB here.
-- Additive: existing rows backfill zulipStreamIds to '{}'. Drops the single-channel
-- uniqueness so multiple rooms/desks may reference the same Zulip channel.
ALTER TABLE "Room" ADD COLUMN "zulipStreamIds" INTEGER[] NOT NULL DEFAULT '{}';
DROP INDEX IF EXISTS "Room_zulipStreamId_key";
