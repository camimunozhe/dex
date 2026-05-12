-- Make meetups.scheduled_at nullable — date/place is now agreed in the in-app chat
-- after the trade is created, not upfront.
-- Run once in Supabase SQL editor.

ALTER TABLE meetups
  ALTER COLUMN scheduled_at DROP NOT NULL;
