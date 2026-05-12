import type { ViewStyle } from 'react-native';

export function availabilityBorder(card: { is_published: boolean }): ViewStyle | null {
  return card.is_published ? { borderWidth: 2, borderColor: '#6366F1' } : null;
}
