-- Zulip integration (Option B: real per-user Zulip client).
-- All columns nullable -> zero-downtime, additive, no backfill required.
-- The encrypted API key (zulipApiKeyEnc) is AES-256-GCM; email/userId live in
-- their own plaintext columns. A bound Zulip stream is unique per Room.
ALTER TABLE "User" ADD COLUMN "zulipEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "zulipUserId" INTEGER;
ALTER TABLE "User" ADD COLUMN "zulipApiKeyEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "zulipLinkedAt" TIMESTAMP(3);
ALTER TABLE "Room" ADD COLUMN "zulipStreamId" INTEGER;
CREATE UNIQUE INDEX "Room_zulipStreamId_key" ON "Room"("zulipStreamId");
