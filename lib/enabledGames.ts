import type { TCGGame } from '@/types/database';

export const ALL_GAMES: TCGGame[] = ['pokemon', 'magic', 'yugioh', 'onepiece', 'digimon', 'lorcana', 'other'];

export const GAME_DISPLAY_NAMES: Record<TCGGame, string> = {
  pokemon: 'Pokémon',
  magic: 'Magic: The Gathering',
  yugioh: 'Yu-Gi-Oh!',
  onepiece: 'One Piece',
  digimon: 'Digimon',
  lorcana: 'Lorcana',
  other: 'Otros',
};

// Always returns a usable list. Falls back to all games if profile hasn't set anything yet.
export function resolveEnabledGames(profileEnabled: TCGGame[] | null | undefined): TCGGame[] {
  if (!profileEnabled || profileEnabled.length === 0) return ALL_GAMES;
  return profileEnabled;
}
