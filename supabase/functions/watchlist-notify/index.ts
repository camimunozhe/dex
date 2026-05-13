// Database webhook handler for cards_collection INSERT and UPDATE.
// On a freshly published card (is_published=true), match against
// card_watchlist entries and send Expo push notifications to the watchers.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: any;
  old_record: any | null;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (payload.table !== 'cards_collection') return new Response('ignored');

  const card = payload.record;
  // Only react when the card becomes published (INSERT with is_published=true,
  // or UPDATE flipping is_published from false to true).
  const becamePublished =
    card.is_published === true &&
    (payload.type === 'INSERT' || payload.old_record?.is_published === false);
  if (!becamePublished) return new Response('not a publish event');

  const catalogKey: 'pokemon_card_id' | 'magic_card_id' | null =
    card.pokemon_card_id ? 'pokemon_card_id' :
    card.magic_card_id ? 'magic_card_id' : null;
  if (!catalogKey) return new Response('no catalog id');

  // Fetch matching watchlist entries (exclude the publisher themselves).
  const { data: entries, error: weErr } = await supabase
    .from('card_watchlist')
    .select('id, user_id, foil_only, conditions, match_only_my_regions')
    .eq(catalogKey, card[catalogKey])
    .neq('user_id', card.user_id);

  if (weErr || !entries || entries.length === 0) {
    return new Response(JSON.stringify({ matched: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  // For region filtering we need the publisher's regions.
  let publisherRegions: string[] = [];
  let publisherUsername = 'alguien';
  {
    const { data: prof } = await supabase
      .from('profiles')
      .select('regions, username')
      .eq('id', card.user_id)
      .single();
    publisherRegions = (prof?.regions ?? []) as string[];
    publisherUsername = (prof?.username as string) ?? 'alguien';
  }

  // Filter entries by per-entry preferences.
  const eligibleUserIds: string[] = [];
  for (const e of entries) {
    if (e.foil_only && !card.is_foil) continue;
    if (Array.isArray(e.conditions) && e.conditions.length > 0 && !e.conditions.includes(card.condition)) continue;
    if (e.match_only_my_regions) {
      // Need the watcher's regions.
      const { data: wp } = await supabase
        .from('profiles')
        .select('regions, premium_status')
        .eq('id', e.user_id)
        .single();
      const watcherRegions = (wp?.regions ?? []) as string[];
      const overlap = publisherRegions.some(r => watcherRegions.includes(r));
      if (!overlap) continue;
      // Only premium users receive alerts (defensive — they shouldn't have entries otherwise).
      const status = wp?.premium_status;
      if (status !== 'active' && status !== 'in_grace') continue;
    } else {
      // Even without region match, still gate on premium status.
      const { data: wp } = await supabase
        .from('profiles')
        .select('premium_status')
        .eq('id', e.user_id)
        .single();
      const status = wp?.premium_status;
      if (status !== 'active' && status !== 'in_grace') continue;
    }
    eligibleUserIds.push(e.user_id);
  }

  if (eligibleUserIds.length === 0) {
    return new Response(JSON.stringify({ matched: entries.length, sent: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Fetch push tokens for those users.
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token, user_id')
    .in('user_id', eligibleUserIds);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ matched: entries.length, sent: 0, reason: 'no tokens' }), { headers: { 'Content-Type': 'application/json' } });
  }

  const expoMessages = tokens.map((t: { token: string }) => ({
    to: t.token,
    title: 'Carta de tu watchlist disponible',
    body: `@${publisherUsername} publicó ${card.card_name}`,
    data: { watchlist_card_id: card.id },
    sound: 'default',
  }));

  const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(expoMessages),
  });

  const result = await expoRes.json();
  return new Response(
    JSON.stringify({ matched: entries.length, sent: expoMessages.length, result }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
