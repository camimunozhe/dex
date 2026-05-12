-- In-app chat messages tied to a meetup (trade negotiation).
-- Only the proposer and receiver of the meetup can read or send messages.
-- Messages are immutable (no UPDATE / DELETE policies).
-- Run once in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id uuid NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) > 0 AND length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_meetup_created
  ON messages (meetup_id, created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_participant" ON messages;
CREATE POLICY "messages_select_participant"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meetups m
      WHERE m.id = messages.meetup_id
        AND (m.proposer_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_insert_sender" ON messages;
CREATE POLICY "messages_insert_sender"
  ON messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM meetups m
      WHERE m.id = messages.meetup_id
        AND (m.proposer_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  );

-- Enable Realtime broadcasts for this table (for in-app chat subscriptions).
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
