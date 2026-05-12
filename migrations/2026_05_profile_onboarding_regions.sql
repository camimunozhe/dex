-- First-login onboarding: track completion + store the regions the user
-- is willing to meet in for intercambios.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS regions text[] NOT NULL DEFAULT '{}';

-- Existing users are considered onboarded so we don't force them through the flow.
UPDATE profiles SET onboarding_completed = true WHERE onboarding_completed = false;
