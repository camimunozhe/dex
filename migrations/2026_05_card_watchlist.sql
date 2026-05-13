-- Premium feature: watchlist for cards. When someone publishes a matching card,
-- the watcher receives a push notification.

CREATE TABLE IF NOT EXISTS card_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pokemon_card_id text REFERENCES pokemon_cards(id) ON DELETE CASCADE,
  magic_card_id text REFERENCES magic_cards(id) ON DELETE CASCADE,
  card_name text NOT NULL,
  set_name text,
  image_url text,
  foil_only boolean NOT NULL DEFAULT false,
  conditions text[] NOT NULL DEFAULT '{}',
  match_only_my_regions boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_watchlist_card_id_check CHECK (
    (pokemon_card_id IS NOT NULL AND magic_card_id IS NULL) OR
    (pokemon_card_id IS NULL AND magic_card_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS card_watchlist_user_pokemon_idx
  ON card_watchlist(user_id, pokemon_card_id) WHERE pokemon_card_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS card_watchlist_user_magic_idx
  ON card_watchlist(user_id, magic_card_id) WHERE magic_card_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS card_watchlist_pokemon_idx ON card_watchlist(pokemon_card_id) WHERE pokemon_card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS card_watchlist_magic_idx ON card_watchlist(magic_card_id) WHERE magic_card_id IS NOT NULL;

ALTER TABLE card_watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own watchlist" ON card_watchlist;
CREATE POLICY "Users manage their own watchlist"
  ON card_watchlist FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
