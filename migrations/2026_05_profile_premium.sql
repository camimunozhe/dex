-- Premium subscription state per profile.
-- Mirrors RevenueCat entitlement state via webhook.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS premium_status text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS premium_until timestamptz,
  ADD COLUMN IF NOT EXISTS premium_product_id text,
  ADD COLUMN IF NOT EXISTS premium_platform text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_premium_status_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_premium_status_check
      CHECK (premium_status IN ('free', 'active', 'in_grace', 'expired'));
  END IF;
END $$;

-- Useful for premium-only queries (boost order, etc.)
CREATE INDEX IF NOT EXISTS profiles_premium_status_idx ON profiles(premium_status);
