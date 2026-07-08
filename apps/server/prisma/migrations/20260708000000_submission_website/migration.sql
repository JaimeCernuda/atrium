-- Public-website publishing (grc-iit/website): track the auto-generated
-- publication PR per submission. All nullable; inert until the integration runs.
ALTER TABLE "Submission" ADD COLUMN "websiteSlug" TEXT;
ALTER TABLE "Submission" ADD COLUMN "websitePrUrl" TEXT;
ALTER TABLE "Submission" ADD COLUMN "websitePrNumber" INTEGER;
ALTER TABLE "Submission" ADD COLUMN "websiteContentHash" TEXT;
ALTER TABLE "Submission" ADD COLUMN "websiteSyncedAt" TIMESTAMP(3);
ALTER TABLE "Submission" ADD COLUMN "unpublishPrUrl" TEXT;
ALTER TABLE "Submission" ADD COLUMN "purgeRequested" BOOLEAN NOT NULL DEFAULT false;
