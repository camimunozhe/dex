// node scripts/sync-magic-cards.js
//
// Fetches all Magic: The Gathering sets and cards from Scryfall (free, no API key)
// and upserts them into magic_sets / magic_cards in Supabase.
//
// Uses the paginated search API instead of bulk download to avoid memory limits.
// ~430 pages × 175 cards = ~75 k cards. Takes ~2–3 min on first run.
//
const { createClient } = require('@supabase/supabase-js');
const { readFileSync }  = require('fs');
const { resolve }       = require('path');

// ── env ──────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SUPABASE_URL     = env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SCRYFALL_SETS_URL = 'https://api.scryfall.com/sets';
// unique=prints → one row per printing (e.g. Lightning Bolt Alpha ≠ Lightning Bolt M10)
const SCRYFALL_CARDS_URL =
  'https://api.scryfall.com/cards/search?q=game%3Apaper&unique=prints&order=released&dir=asc';

const BATCH_SIZE = 175;  // Scryfall's page size
const DELAY_MS   = 120;  // ms between API calls (≤ 10 req/s per Scryfall guidelines)

// ── helpers ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'dex-app/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

function mapCard(c) {
  const prices = c.prices ?? {};
  const normal = prices.usd      ? parseFloat(prices.usd)       : null;
  const foil   = prices.usd_foil ? parseFloat(prices.usd_foil)  : null;
  const imgs   = c.image_uris ?? null;
  return {
    id:                       c.id,
    name:                     c.name,
    set_id:                   c.set,
    set_name:                 c.set_name,
    collector_number:         c.collector_number ?? null,
    rarity:                   c.rarity ?? null,
    type_line:                c.type_line ?? null,
    mana_cost:                c.mana_cost ?? null,
    cmc:                      c.cmc ?? null,
    colors:                   c.colors ?? null,
    color_identity:           c.color_identity ?? null,
    oracle_text:              c.oracle_text ?? null,
    power:                    c.power ?? null,
    toughness:                c.toughness ?? null,
    loyalty:                  c.loyalty ?? null,
    image_url:                imgs?.normal  ?? null,
    image_url_large:          imgs?.large   ?? null,
    tcgplayer_normal_market:  normal,
    tcgplayer_foil_market:    foil,
    price_updated_at:         (normal !== null || foil !== null)
                                ? new Date().toISOString()
                                : null,
  };
}

// ── sync sets ─────────────────────────────────────────────────────────────────
async function syncSets() {
  console.log('Fetching sets from Scryfall...');
  const { data: sets } = await fetchJson(SCRYFALL_SETS_URL);

  const rows = sets.map(s => ({
    id:           s.code,
    name:         s.name,
    set_type:     s.set_type  ?? null,
    released_at:  s.released_at ?? null,
    card_count:   s.card_count  ?? 0,
    icon_svg_uri: s.icon_svg_uri ?? null,
  }));

  const { error } = await supabase
    .from('magic_sets')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
  if (error) throw new Error(`Sets upsert failed: ${error.message}`);

  console.log(`✓ ${rows.length} sets synced\n`);
}

// ── sync cards (paginated) ────────────────────────────────────────────────────
async function syncCards() {
  console.log('Fetching cards from Scryfall (paginated, ~175 cards/page)...');
  console.log('This takes 2–4 minutes. Please wait.\n');

  let nextUrl   = SCRYFALL_CARDS_URL;
  let pageNum   = 0;
  let total     = 0;
  let errors    = 0;

  while (nextUrl) {
    pageNum++;
    let data;
    try {
      data = await fetchJson(nextUrl);
    } catch (err) {
      console.error(`\n  Page ${pageNum} fetch failed: ${err.message}. Retrying in 2s...`);
      await sleep(2000);
      try { data = await fetchJson(nextUrl); }
      catch (e) { console.error(`  Skipping page ${pageNum}: ${e.message}`); break; }
    }

    const rows = data.data.map(mapCard);

    const { error } = await supabase
      .from('magic_cards')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });

    if (error) {
      errors++;
      console.error(`\n  Upsert error on page ${pageNum}: ${error.message}`);
    } else {
      total += rows.length;
    }

    const estimate = data.total_cards ? `/${data.total_cards}` : '';
    process.stdout.write(`\r  Page ${pageNum} — ${total}${estimate} cards synced   `);

    nextUrl = data.has_more ? data.next_page : null;
    if (nextUrl) await sleep(DELAY_MS);
  }

  console.log(`\n\n✓ ${total} cards synced${errors ? ` (${errors} page errors)` : ''}\n`);
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Magic: The Gathering card sync (Scryfall) ===\n');
  await syncSets();
  await sleep(DELAY_MS);
  await syncCards();
  console.log('=== Done ===');
}

main().catch(err => { console.error('\n' + err.message); process.exit(1); });
