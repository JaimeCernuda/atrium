-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerEmail" TEXT;

-- CreateIndex
CREATE INDEX "Room_ownerEmail_idx" ON "Room"("ownerEmail");
