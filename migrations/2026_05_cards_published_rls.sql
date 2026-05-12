-- Update cards_collection SELECT policy to use the unified is_published flag.
-- Previously it exposed rows where is_for_trade OR is_for_sale was true,
-- which left cards published via the new flag invisible to other users.

DROP POLICY IF EXISTS "Colección propia siempre visible" ON cards_collection;

CREATE POLICY "Colección propia siempre visible" ON cards_collection
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR is_published = true
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = cards_collection.user_id
        AND profiles.collection_public = true
    )
  );
