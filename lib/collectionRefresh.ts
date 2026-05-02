import type { CardCollection } from '@/types/database';

type Event =
  | { type: 'patch'; cardId: string; patch: Partial<CardCollection> }
  | { type: 'remove'; cardId: string };

type Listener = (event: Event) => void;

const listeners = new Set<Listener>();
let pendingFullRefresh = false;

export function subscribeCollection(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function patchCollectionCard(cardId: string, patch: Partial<CardCollection>) {
  listeners.forEach(l => l({ type: 'patch', cardId, patch }));
}

export function removeCollectionCard(cardId: string) {
  listeners.forEach(l => l({ type: 'remove', cardId }));
}

export function requestCollectionRefresh() {
  pendingFullRefresh = true;
}

export function consumeCollectionRefresh(): boolean {
  const v = pendingFullRefresh;
  pendingFullRefresh = false;
  return v;
}
