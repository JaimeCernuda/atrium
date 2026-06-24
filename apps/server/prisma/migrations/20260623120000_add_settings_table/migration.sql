-- Org-wide singleton settings table.
-- Holds the Global-chat -> Zulip channel+topic mapping (admin-editable).
-- Additive: a single "singleton" row is upserted lazily at write time.
-- CREATE-ONLY: apply with `prisma migrate deploy` at release, not against a live DB here.
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "globalZulipChannelId" INTEGER,
    "globalZulipTopicName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);
