-- Digest: add shareToken (backfill existing rows with random cuid-ish strings).

ALTER TABLE "Digest" ADD COLUMN "shareToken" TEXT;

-- Backfill: use gen_random_uuid() shaped like a cuid-ish slug. Any unguessable
-- random string is fine; we just need uniqueness and unpredictability.
UPDATE "Digest"
SET "shareToken" = 'dsh_' || replace(gen_random_uuid()::text, '-', '')
WHERE "shareToken" IS NULL;

ALTER TABLE "Digest" ALTER COLUMN "shareToken" SET NOT NULL;

CREATE UNIQUE INDEX "Digest_shareToken_key" ON "Digest"("shareToken");
