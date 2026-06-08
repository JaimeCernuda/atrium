-- Resource tagging on submissions: which NSF cyberinfrastructure the work used.
-- Tracked separately for acknowledgement/reporting (Chameleon, Delta, DeltaAI).
ALTER TABLE "Submission" ADD COLUMN "resources" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
