-- Add public social link fields to users for the new Socials bento card
-- on the public profile. Both are optional; users opt in via /profile.

ALTER TABLE "users"
  ADD COLUMN "instagramHandle" VARCHAR(30),
  ADD COLUMN "linkedinUrl" VARCHAR(200);
