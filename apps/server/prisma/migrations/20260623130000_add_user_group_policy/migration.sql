-- Additive: store the admin-configurable Zulip user-group visibility policy
-- on the Settings singleton. Both columns hold a JSON array of Zulip group ids.
ALTER TABLE "Settings" ADD COLUMN "userGroupFeatured" TEXT;
ALTER TABLE "Settings" ADD COLUMN "userGroupSecondary" TEXT;
