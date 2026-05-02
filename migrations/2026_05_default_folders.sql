-- Default folders by game — one-shot migration
-- Run once in Supabase SQL editor.

-- 1. Schema
ALTER TABLE collection_folders
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS game text;

-- 2. Backfill: per user, group unfoldered cards by game,
--    create one default folder per game, assign cards to it.
DO $$
DECLARE
  user_record RECORD;
  game_record RECORD;
  new_folder_id uuid;
  game_label text;
  game_color text;
BEGIN
  FOR user_record IN
    SELECT DISTINCT user_id FROM cards_collection WHERE folder_id IS NULL
  LOOP
    FOR game_record IN
      SELECT DISTINCT game FROM cards_collection
      WHERE user_id = user_record.user_id
        AND folder_id IS NULL
        AND game != 'other'
    LOOP
      game_label := CASE game_record.game
        WHEN 'pokemon'  THEN 'Pokémon'
        WHEN 'magic'    THEN 'Magic'
        WHEN 'yugioh'   THEN 'Yu-Gi-Oh!'
        WHEN 'onepiece' THEN 'One Piece'
        WHEN 'digimon'  THEN 'Digimon'
        WHEN 'lorcana'  THEN 'Lorcana'
      END;
      game_color := CASE game_record.game
        WHEN 'pokemon'  THEN '#FACC15'
        WHEN 'magic'    THEN '#A78BFA'
        WHEN 'yugioh'   THEN '#60A5FA'
        WHEN 'onepiece' THEN '#F87171'
        WHEN 'digimon'  THEN '#34D399'
        WHEN 'lorcana'  THEN '#FB923C'
      END;

      INSERT INTO collection_folders (user_id, name, color, is_default, game)
        VALUES (user_record.user_id, game_label, game_color, true, game_record.game)
        RETURNING id INTO new_folder_id;

      UPDATE cards_collection
        SET folder_id = new_folder_id
        WHERE user_id = user_record.user_id
          AND folder_id IS NULL
          AND game = game_record.game;
    END LOOP;
  END LOOP;
END $$;
