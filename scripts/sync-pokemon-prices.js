// node scripts/sync-pokemon-prices.js
const { createClient } = require('@supabase/supabase-js');
const { readFileSync }  = require('fs');
const { resolve }       = require('path');

// Load .env manually
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SUPABASE_URL     = env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const POKEMON_API_KEY  = env.POKEMONTCG_API_KEY || '';
const API_BASE         = 'https://api.pokemontcg.io/v2/cards';
const PAGE_SIZE        = 250;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function fetchPage(page) {
  const url     = `${API_BASE}?pageSize=${PAGE_SIZE}&page=${page}&select=id,tcgplayer`;
  const headers = POKEMON_API_KEY ? { 'X-Api-Key': POKEMON_API_KEY } : {};
  const res     = await fetch(url, { headers });
  if (!res.ok) throw new Error(`API ${res.status} on page ${page}`);
  return res.json();
}

function extractPrices(tcgplayer) {
  if (!tcgplayer?.prices) return null;
  const p      = tcgplayer.prices;
  const normal = p.normal ?? p.unlimited ?? null;
  const foil   = p.holofoil ?? p.reverseHolofoil ?? p['1stEditionHolofoil'] ?? null;
  return {
    normal_market: normal?.market ?? null,
    normal_low:    normal?.low    ?? null,
    foil_market:   foil?.market   ?? null,
    foil_low:      foil?.low      ?? null,
  };
}

async function upsertBatch(cards, existingIds) {
  const cardUpdates = [];
  const historyRows = [];
  const today       = new Date().toISOString().slice(0, 10);

  for (const card of cards) {
    if (!existingIds.has(card.id)) continue;
    const prices = extractPrices(card.tcgplayer);
    if (!prices || Object.values(prices).every(v => v === null)) continue;

    cardUpdates.push({
      id:                       card.id,
      tcgplayer_normal_market:  prices.normal_market,
      tcgplayer_normal_low:     prices.normal_low,
      tcgplayer_foil_market:    prices.foil_market,
      tcgplayer_foil_low:       prices.foil_low,
      price_updated_at:         new Date().toISOString(),
    });

    historyRows.push({
      card_id:       card.id,
      date:          today,
      normal_market: prices.normal_market,
      normal_low:    prices.normal_low,
      foil_market:   prices.foil_market,
      foil_low:      prices.foil_low,
    });
  }

  if (cardUpdates.length > 0) {
    const payload = cardUpdates.map(c => ({
      id: c.id,
      nm: c.tcgplayer_normal_market,
      nl: c.tcgplayer_normal_low,
      fm: c.tcgplayer_foil_market,
      fl: c.tcgplayer_foil_low,
    }));
    const { error } = await supabase.rpc('batch_update_pokemon_prices', { updates: payload });
    if (error) console.error('  update error:', error.message);
  }

  if (historyRows.length > 0) {
    const { error } = await supabase
      .from('pokemon_card_price_history')
      .upsert(historyRows, { onConflict: 'card_id,date', ignoreDuplicates: false });
    if (error) console.error('  history error:', error.message);
  }

  return cardUpdates.length;
}

async function loadExistingIds() {
  const ids = new Set();
  let page  = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select('id')
      .range(page * size, page * size + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(r => ids.add(r.id));
    if (data.length < size) break;
    page++;
  }
  return ids;
}

async function main() {
  console.log('=== Pokemon price sync ===');
  console.log(`API key: ${POKEMON_API_KEY ? 'present (20k req/day)' : 'missing (1k req/day, should be fine)'}`);

  process.stdout.write('Loading existing card IDs from DB... ');
  const existingIds = await loadExistingIds();
  console.log(`${existingIds.size} cards in DB`);

  const first      = await fetchPage(1);
  const total      = first.totalCount;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  console.log(`Cards in API: ${total} — Pages: ${totalPages}\n`);

  let updated = 0;

  process.stdout.write(`Page 1/${totalPages}... `);
  updated += await upsertBatch(first.data, existingIds);
  console.log(`${updated} with prices so far`);

  for (let page = 2; page <= totalPages; page++) {
    process.stdout.write(`Page ${page}/${totalPages}... `);
    try {
      const { data } = await fetchPage(page);
      const n = await upsertBatch(data, existingIds);
      updated += n;
      console.log(`${updated} with prices so far`);
    } catch (err) {
      console.error(`Failed: ${err.message}. Retrying...`);
      await new Promise(r => setTimeout(r, 2000));
      try {
        const { data } = await fetchPage(page);
        updated += await upsertBatch(data, existingIds);
        console.log('retry ok');
      } catch (e) {
        console.error(`Skipping page ${page}: ${e.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nDone. ${updated} cards synced with prices.`);
}

main().catch(err => { console.error(err); process.exit(1); });
