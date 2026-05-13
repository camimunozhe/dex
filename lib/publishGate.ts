import { supabase } from '@/lib/supabase';
import { FREE_LIMITS, limitReachedMessage } from '@/lib/planLimits';

export type GateDialog = {
  confirm: (opts: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }) => void;
};

/**
 * Returns true if the user can publish `addCount` more cards.
 * If not, shows a paywall confirm dialog and returns false.
 * Premium users pass through unconditionally.
 */
export async function assertCanPublish(params: {
  userId: string;
  isPremium: boolean;
  addCount?: number;
  dialog: GateDialog;
  onUpgrade: () => void;
}): Promise<boolean> {
  const { userId, isPremium, addCount = 1, dialog, onUpgrade } = params;
  if (isPremium) return true;

  const { count, error } = await supabase
    .from('cards_collection')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_published', true);

  if (error) return true; // fail open — don't block on query errors

  const current = count ?? 0;
  if (current + addCount <= FREE_LIMITS.publishedCards) return true;

  const { title, message } = limitReachedMessage('publishedCards', current, FREE_LIMITS.publishedCards);
  dialog.confirm({
    title,
    message,
    confirmText: 'Pasarme a Pro',
    cancelText: 'Más tarde',
    onConfirm: onUpgrade,
  });
  return false;
}
