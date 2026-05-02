import type { ViewStyle } from 'react-native';

export function availabilityBorder(card: { is_for_trade: boolean; is_for_sale: boolean }): ViewStyle | null {
  if (card.is_for_trade && card.is_for_sale) {
    return {
      borderWidth: 2,
      borderTopColor: '#22D3EE',
      borderLeftColor: '#22D3EE',
      borderBottomColor: '#4ADE80',
      borderRightColor: '#4ADE80',
    };
  }
  if (card.is_for_trade) return { borderWidth: 2, borderColor: '#22D3EE' };
  if (card.is_for_sale) return { borderWidth: 2, borderColor: '#4ADE80' };
  return null;
}
