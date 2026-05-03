import type { TCGGame } from '@/types/database';
import { supabase } from './supabase';

const DEFAULT_NAMES: Partial<Record<TCGGame, string>> = {
  pokemon: 'Pokémon',
  magic: 'Magic',
  yugioh: 'Yu-Gi-Oh!',
  onepiece: 'One Piece',
  digimon: 'Digimon',
  lorcana: 'Lorcana',
};

const DEFAULT_COLORS: Partial<Record<TCGGame, string>> = {
  pokemon: '#FACC15',
  magic: '#A78BFA',
  yugioh: '#60A5FA',
  onepiece: '#F87171',
  digimon: '#34D399',
  lorcana: '#FB923C',
};

// Moves every card inside `folderId` into the user's default folder for that game.
// Custom folders are constrained to a single game by validateFolderGame, so all
// cards inside share the same game. Cards with game='other' have no default and
// stay loose (folder_id falls back to null on cascade).
export async function reassignFolderCardsToDefault(userId: string, folderId: string): Promise<void> {
  const { data: cards } = await supabase
    .from('cards_collection')
    .select('game')
    .eq('user_id', userId)
    .eq('folder_id', folderId)
    .limit(1);
  if (!cards || cards.length === 0) return;
  const game = cards[0].game as TCGGame;
  if (game === 'other') return;
  const defaultId = await getOrCreateDefaultFolder(userId, game);
  if (!defaultId) return;
  await supabase
    .from('cards_collection')
    .update({ folder_id: defaultId })
    .eq('user_id', userId)
    .eq('folder_id', folderId);
}

export async function getOrCreateDefaultFolder(userId: string, game: TCGGame): Promise<string | null> {
  if (game === 'other') return null;

  const { data: existing } = await supabase
    .from('collection_folders')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .eq('game', game)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created } = await supabase
    .from('collection_folders')
    .insert({
      user_id: userId,
      name: DEFAULT_NAMES[game]!,
      color: DEFAULT_COLORS[game]!,
      is_default: true,
      game,
    })
    .select('id')
    .single();
  return created?.id ?? null;
}
