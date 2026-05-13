import { useAuth } from '@/context/AuthContext';

type PremiumStatus = 'free' | 'active' | 'in_grace' | 'expired';

export type PremiumState = {
  isPremium: boolean;
  status: PremiumStatus;
  until: Date | null;
  productId: string | null;
};

export function usePremium(): PremiumState {
  const { profile } = useAuth();
  const status = (profile?.premium_status ?? 'free') as PremiumStatus;
  const isPremium = status === 'active' || status === 'in_grace';
  return {
    isPremium,
    status,
    until: profile?.premium_until ? new Date(profile.premium_until) : null,
    productId: profile?.premium_product_id ?? null,
  };
}
