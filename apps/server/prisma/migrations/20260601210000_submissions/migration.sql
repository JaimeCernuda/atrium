-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "citationKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "pubType" TEXT,
    "funding" TEXT NOT NULL,
    "githubUrl" TEXT NOT NULL,
    "doi" TEXT,
    "abstract" TEXT NOT NULL,
    "notes" TEXT,
    "submitterId" TEXT NOT NULL,
    "submitterName" TEXT NOT NULL,
    "submitterEmail" TEXT NOT NULL,
    "files" JSONB NOT NULL DEFAULT '[]',
    "stage" TEXT NOT NULL DEFAULT 'new',
    "status" TEXT NOT NULL DEFAULT 'received',
    "deliveryLog" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Submission_citationKey_idx" ON "Submission"("citationKey");

-- CreateIndex
CREATE INDEX "Submission_submitterId_idx" ON "Submission"("submitterId");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");
