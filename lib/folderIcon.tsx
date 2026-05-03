import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { TCGGame } from '@/types/database';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const GAME_ICON: Record<TCGGame, { name: IoniconName; color: string; image?: ReturnType<typeof require> }> = {
  pokemon: { name: 'flash-outline', color: '#FACC15', image: require('../assets/pokemon-tcg-logo.png') },
  magic: { name: 'color-wand-outline', color: '#A78BFA', image: require('../assets/magic-tcg-logo.png') },
  yugioh: { name: 'triangle-outline', color: '#60A5FA' },
  onepiece: { name: 'compass-outline', color: '#F87171' },
  digimon: { name: 'hardware-chip-outline', color: '#34D399' },
  lorcana: { name: 'flame-outline', color: '#FB923C' },
  other: { name: 'albums-outline', color: '#94A3B8' },
};

export function FolderIcon({ game, color, boxSize, iconSize, borderRadius }: {
  game: TCGGame | null;
  color: string;
  boxSize: number;
  iconSize: number;
  borderRadius?: number;
}) {
  const radius = borderRadius ?? boxSize / 4;
  const gameInfo = game && game !== 'other' ? GAME_ICON[game] : null;

  if (gameInfo?.image) {
    return (
      <View style={{ width: boxSize, height: boxSize, borderRadius: radius, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={gameInfo.image} style={{ width: iconSize, height: iconSize }} contentFit="contain" />
      </View>
    );
  }

  if (gameInfo) {
    return (
      <View style={{ width: boxSize, height: boxSize, borderRadius: radius, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={gameInfo.name} size={iconSize} color={gameInfo.color} />
      </View>
    );
  }

  return (
    <View style={{ width: boxSize, height: boxSize, borderRadius: radius, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="folder" size={iconSize} color={color} />
    </View>
  );
}
