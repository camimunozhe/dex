import { supabase } from '@/lib/supabase';
import type { TCGGame, CardCondition } from '@/types/database';

export type WatchlistEntry = {
  id: string;
  user_id: string;
  pokemon_card_id: string | null;
  magic_card_id: string | null;
  card_name: string;
  set_name: string | null;
  image_url: string | null;
  foil_only: boolean;
  conditions: CardCondition[];
  match_only_my_regions: boolean;
  created_at: string;
};

export type AddWatchlistInput = {
  userId: string;
  game: TCGGame;
  catalogCardId: string;
  cardName: string;
  setName: string | null;
  imageUrl: string | null;
};

export async function addToWatchlist(input: AddWatchlistInput): Promise<{ error: string | null }> {
  const row: any = {
    user_id: input.userId,
    card_name: input.cardName,
    set_name: input.setName,
    image_url: input.imageUrl,
  };
  if (input.game === 'pokemon') row.pokemon_card_id = input.catalogCardId;
  else if (input.game === 'magic') row.magic_card_id = input.catalogCardId;
  else return { error: 'Juego no soportado para watchlist' };

  const { error } = await supabase.from('card_watchlist').insert(row);
  return { error: error?.message ?? null };
}

export async function removeFromWatchlist(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('card_watchlist').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export async function isInWatchlist(
  userId: string,
  game: TCGGame,
  catalogCardId: string,
): Promise<boolean> {
  const col = game === 'pokemon' ? 'pokemon_card_id' : 'magic_card_id';
  const { count } = await supabase
    .from('card_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq(col, catalogCardId);
  return (count ?? 0) > 0;
}
