// RevenueCat webhook → updates profiles.premium_* fields.
// Configure the webhook in RevenueCat dashboard:
//   URL: https://<project-ref>.functions.supabase.co/revenuecat-webhook
//   Authorization header: Bearer <REVENUECAT_WEBHOOK_SECRET>

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';

type RCEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'PRODUCT_CHANGE'
  | 'CANCELLATION'
  | 'UNCANCELLATION'
  | 'NON_RENEWING_PURCHASE'
  | 'EXPIRATION'
  | 'BILLING_ISSUE'
  | 'SUBSCRIBER_ALIAS'
  | 'SUBSCRIPTION_PAUSED'
  | 'TRANSFER';

type RCEvent = {
  type: RCEventType;
  app_user_id: string;
  product_id?: string;
  store?: 'APP_STORE' | 'PLAY_STORE' | 'STRIPE' | 'PROMOTIONAL';
  expiration_at_ms?: number | null;
  event_timestamp_ms: number;
};

function statusFromEvent(ev: RCEvent): 'active' | 'in_grace' | 'expired' | null {
  switch (ev.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'NON_RENEWING_PURCHASE':
    case 'PRODUCT_CHANGE':
    case 'UNCANCELLATION':
    case 'TRANSFER':
      return 'active';
    case 'BILLING_ISSUE':
      return 'in_grace';
    case 'EXPIRATION':
    case 'CANCELLATION':
    case 'SUBSCRIPTION_PAUSED':
      return 'expired';
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  if (WEBHOOK_SECRET) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${WEBHOOK_SECRET}`) {
      return new Response('unauthorized', { status: 401 });
    }
  }

  let payload: { event?: RCEvent } | null = null;
  try { payload = await req.json(); } catch { /* ignore */ }
  const ev = payload?.event;
  if (!ev?.app_user_id) {
    return new Response('bad request', { status: 400 });
  }

  const newStatus = statusFromEvent(ev);
  if (!newStatus) {
    return new Response(JSON.stringify({ ok: true, ignored: ev.type }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const update: Record<string, unknown> = {
    premium_status: newStatus,
    premium_product_id: ev.product_id ?? null,
    premium_platform: ev.store ?? null,
    premium_until: ev.expiration_at_ms ? new Date(ev.expiration_at_ms).toISOString() : null,
  };

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', ev.app_user_id);

  if (error) {
    console.error('update failed', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  // When the user is no longer premium, drop their boost flags so they don't
  // keep a Pro-only effect for free.
  if (newStatus === 'expired') {
    await supabase
      .from('cards_collection')
      .update({ is_boosted: false })
      .eq('user_id', ev.app_user_id)
      .eq('is_boosted', true);
  }

  return new Response(JSON.stringify({ ok: true, status: newStatus }), {
    headers: { 'content-type': 'application/json' },
  });
});
