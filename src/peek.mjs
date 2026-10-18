// Prints one raw row of what the study reads, so you can see the data before trusting any chart.
//   node src/peek.mjs board    one row of this month's busiest-wallets board (1 credit)
//   node src/peek.mjs feed     one row of the scored-trade feed (10 credits)
import {loadKey, createClient} from './predictefy.mjs';
import {shortWallet} from './engine.mjs';

const what = process.argv[2] || 'board';
const client = createClient({key: loadKey()});
// Long ids are shortened on screen. The API returns them in full.
const trim = value => (typeof value === 'string' && /^(0x[0-9a-f]{40,}|\d{30,})$/i.test(value) ? shortWallet(value) : typeof value === 'string' && /^0x[0-9a-f]{40}-\d+$/i.test(value) ? `${shortWallet(value.split('-')[0])}-…` : value);
const show = row => console.log(JSON.stringify(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, trim(value)])), null, 2));

if (what === 'board') {
  const r = await client.get('peek', '/v1/traders/polymarket/leaderboard', {by: 'volume', window: 'month', limit: 100});
  if (!r.ok) { console.error(`The leaderboard answered ${r.status} ${r.code}`); process.exit(1); }
  console.log(`GET /v1/traders/polymarket/leaderboard?by=volume&window=month  →  ${r.data.length} rows, ${client.usage.credits} credit`);
  show(r.data[0]);
} else if (what === 'feed') {
  const r = await client.get('peek', '/v1/traders/smart-money', {venue: 'polymarket', category: 'fish', window: 'all', limit: 1});
  if (!r.ok) { console.error(`The feed answered ${r.status} ${r.code}`); process.exit(1); }
  console.log(`GET /v1/traders/smart-money?venue=polymarket&category=fish&limit=1  →  ${client.usage.credits} credits`);
  show(r.data[0]);
} else {
  console.error('Usage: node src/peek.mjs board | feed');
  process.exit(1);
}
