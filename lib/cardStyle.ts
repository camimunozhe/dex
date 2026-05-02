import type { ViewStyle } from 'react-native';

export function availabilityBorder(card: { is_for_trade: boolean; is_for_sale: boolean }): ViewStyle | null {
  if (card.is_for_trade && card.is_for_sale) {
    return {
      borderWidth: 2,
      borderTopColor: '#3B82F6',
      borderLeftColor: '#3B82F6',
      borderBottomColor: '#4ADE80',
      borderRightColor: '#4ADE80',
    };
  }
  if (card.is_for_trade) return { borderWidth: 2, borderColor: '#3B82F6' };
  if (card.is_for_sale) return { borderWidth: 2, borderColor: '#4ADE80' };
  return null;
}
