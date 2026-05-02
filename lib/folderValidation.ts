import { supabase } from './supabase';
import type { TCGGame } from '@/types/database';

const GAME_LABELS: Record<TCGGame, string> = {
  pokemon: 'Pokémon',
  magic: 'Magic: The Gathering',
  yugioh: 'Yu-Gi-Oh!',
  onepiece: 'One Piece',
  digimon: 'Digimon',
  lorcana: 'Lorcana',
  other: 'Otro',
};

export function gameLabel(g: TCGGame): string {
  return GAME_LABELS[g];
}

export async function getFolderGame(folderId: string): Promise<TCGGame | null> {
  const { data } = await supabase
    .from('cards_collection')
    .select('game')
    .eq('folder_id', folderId)
    .limit(1)
    .maybeSingle();
  return (data?.game as TCGGame) ?? null;
}

export type FolderGameCheck =
  | { ok: true }
  | { ok: false; folderGame: TCGGame };

export async function validateFolderGame(
  folderId: string,
  games: TCGGame[],
): Promise<FolderGameCheck> {
  const folderGame = await getFolderGame(folderId);
  if (folderGame === null) return { ok: true };
  if (games.every(g => g === folderGame)) return { ok: true };
  return { ok: false, folderGame };
}
