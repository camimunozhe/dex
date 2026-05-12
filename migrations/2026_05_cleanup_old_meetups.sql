-- One-shot cleanup: legacy meetup data is no longer useful — the trade flow
-- changed (chat-based negotiation, nullable scheduled_at) and old records
-- don't reflect the new shape.
-- TRUNCATE cascades to meetup_cards, meetup_ratings, and messages.
-- Run once in Supabase SQL editor. DESTRUCTIVE — irreversible.

TRUNCATE meetups CASCADE;
