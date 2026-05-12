-- Drop legacy CHECK constraint that required either safe_zone_id or
-- custom_location at insert time. In the new flow, location is agreed in
-- the in-app chat after the trade is created, not upfront.
-- Run once in Supabase SQL editor.

ALTER TABLE meetups DROP CONSTRAINT IF EXISTS location_required;
