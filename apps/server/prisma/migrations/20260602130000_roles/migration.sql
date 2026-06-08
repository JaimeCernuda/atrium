-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'external';

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Role_sortOrder_idx" ON "Role"("sortOrder");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- Backfill: existing admins become owners
UPDATE "User" SET "role" = 'owner' WHERE "isAdmin" = true;
