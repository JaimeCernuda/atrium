-- CreateTable
CREATE TABLE "Digest" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "markdown" TEXT NOT NULL,
    "title" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "BotToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Digest_date_key" ON "Digest"("date");

-- CreateIndex
CREATE INDEX "Digest_date_idx" ON "Digest"("date");

-- CreateIndex
CREATE INDEX "Reminder_dueAt_idx" ON "Reminder"("dueAt");

-- CreateIndex
CREATE INDEX "Reminder_createdById_idx" ON "Reminder"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "BotToken_tokenHash_key" ON "BotToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BotToken_tokenHash_idx" ON "BotToken"("tokenHash");
