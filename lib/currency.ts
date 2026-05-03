import type { Currency } from '@/types/database';

function thousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// For market prices stored in USD — converts to display currency
export function formatPrice(valueUsd: number, currency: Currency = 'usd', usdToClp = 950): string {
  if (currency === 'clp') return `$${thousands(valueUsd * usdToClp)}`;
  return `$${valueUsd % 1 === 0 ? valueUsd : valueUsd.toFixed(2)}`;
}

// For user-entered prices stored directly in their currency — no rate conversion
export function formatCurrencyValue(value: number, currency: Currency): string {
  if (currency === 'clp') return `$${thousands(value)}`;
  return `$${value % 1 === 0 ? value : value.toFixed(2)}`;
}

export function currencyLabel(currency: Currency): string {
  return currency === 'clp' ? 'CLP' : 'USD';
}

// Converts an amount stored in `from` currency to the `to` currency.
export function convertCurrency(value: number, from: Currency, to: Currency, usdToClp: number): number {
  if (from === to) return value;
  if (from === 'usd' && to === 'clp') return value * usdToClp;
  if (from === 'clp' && to === 'usd') return value / usdToClp;
  return value;
}
