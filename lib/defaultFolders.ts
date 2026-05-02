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
