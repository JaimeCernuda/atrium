-- AlterTable
ALTER TABLE "Reminder" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "Reminder" ADD COLUMN "createdByBotId" TEXT;

-- CreateIndex
CREATE INDEX "Reminder_createdByBotId_idx" ON "Reminder"("createdByBotId");
