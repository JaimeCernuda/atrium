-- CREATE-ONLY: applied via `prisma migrate deploy` at release, NOT against the live DB here.
-- Additive, non-breaking: existing rows default to superseded = false. A "Papers"
-- research room is hidden from the floorplan when its per-student desk supersedes
-- it; reversible by PATCHing superseded back to false.
ALTER TABLE "Room" ADD COLUMN "superseded" BOOLEAN NOT NULL DEFAULT false;
