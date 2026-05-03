import type { CardCollection, Currency } from '@/types/database';
import { convertCurrency } from './currency';

type CatalogPrices = {
  tcgplayer_normal_market: number | null;
  tcgplayer_foil_market: number | null;
} | null | undefined;

export type CardWithCatalog = CardCollection & {
  pokemon_cards?: CatalogPrices;
  magic_cards?: CatalogPrices;
};

// USD-denominated market price from whichever catalog this card is linked to.
export function marketPriceUsd(card: CardWithCatalog): number | null {
  const p = card.pokemon_cards ?? card.magic_cards;
  if (!p) return null;
  const normal = p.tcgplayer_normal_market;
  const foil = p.tcgplayer_foil_market;
  const value = card.is_foil ? (foil ?? normal) : (normal ?? foil);
  return value ?? null;
}

// Effective price in the user's display currency.
// Manual `price_reference` is converted from its own currency; market prices are USD.
export function effectivePrice(card: CardWithCatalog, displayCurrency: Currency, usdToClp: number): number {
  if (card.price_reference != null) {
    return convertCurrency(card.price_reference, card.price_reference_currency, displayCurrency, usdToClp);
  }
  const usd = marketPriceUsd(card);
  if (usd == null) return 0;
  return displayCurrency === 'clp' ? usd * usdToClp : usd;
}

export const COLLECTION_CARD_SELECT =
  'id, game, card_name, set_name, card_number, quantity, is_foil, is_for_trade, is_for_sale, price_reference, price_reference_currency, image_url, folder_id, pokemon_cards(tcgplayer_normal_market, tcgplayer_foil_market), magic_cards(tcgplayer_normal_market, tcgplayer_foil_market)';
