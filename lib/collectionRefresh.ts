import type { CardCollection } from '@/types/database';

type Event =
  | { type: 'refresh' }
  | { type: 'patch'; cardId: string; patch: Partial<CardCollection> }
  | { type: 'remove'; cardId: string };

type Listener = (event: Event) => void;

const listeners = new Set<Listener>();

export function subscribeCollection(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emit(event: Event) {
  listeners.forEach(l => l(event));
}

export function requestCollectionRefresh() {
  emit({ type: 'refresh' });
}

export function patchCollectionCard(cardId: string, patch: Partial<CardCollection>) {
  emit({ type: 'patch', cardId, patch });
}

export function removeCollectionCard(cardId: string) {
  emit({ type: 'remove', cardId });
}
