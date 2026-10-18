// Runs the study against Predictefy and saves every response it used under data/.
//   node src/study.mjs            the whole study, at settings that fit the free plan
//   node src/study.mjs --quick    the eight leaderboards only (8 credits), printed and not saved
//   node src/study.mjs --report   rebuild data/results.json from the saved responses (0 credits)
// Options: --pages=15 (feed pages per label)  --markets=2500 (markets to look up)  --books=10  --rpm=50  --resume
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {project, loadKey, createClient, pool, PlanError} from './predictefy.mjs';
import {WINDOWS, shortWallet, handleOf, windowSummaries, buildResults, flips} from './engine.mjs';

const flag = (name, fallback) => { const hit = process.argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`)); return hit ? (hit.includes('=') ? hit.split('=')[1] : true) : fallback; };
const quick = flag('quick', false), reportOnly = flag('report', false), resume = flag('resume', false);
const settings = {pages: Number(flag('pages', 15)), markets: Number(flag('markets', 2500)), books: Number(flag('books', 10)), bookPages: Number(flag('book-pages', 4)), requestsPerMinute: Number(flag('rpm', 50)), parallel: Number(flag('parallel', 6))};
const dataDir = resolve(project, process.env.STUDY_DATA || 'data'); mkdirSync(dataDir, {recursive: true});
const file = name => resolve(dataDir, name);
const readJson = (name, fallback = null) => { try { return JSON.parse(readFileSync(file(name), 'utf8')); } catch { return fallback; } };
const writeJson = (name, value) => writeFileSync(file(name), JSON.stringify(value));
const usd = value => `${value < 0 ? '-' : ''}$${Math.round(Math.abs(value)).toLocaleString('en-US')}`;
const pct = value => `${Math.round(value * 100)}%`;
const say = text => console.log(text);
const VENUE = 'polymarket';
const FEEDS = ['fish', 'fresh', 'whale', 'bot', 'any'];

function printBoards(boards) {
  for (const s of windowSummaries(boards)) {
    const name = {day: 'today', week: 'this week', month: 'this month', all: 'all time'}[s.window];
    say(`BOARD  | ${name.padEnd(10)} | top earners made ${usd(s.earners.profit).padStart(13)}, top 10 took ${pct(s.earners.top10Share)} | busiest ${s.busiest.wallets} traded ${usd(s.busiest.volume).padStart(15)} for ${usd(s.busiest.profit).padStart(13)}, ${s.busiest.inRed} in the red | ${s.onBoth} on both`);
  }
}

function report() {
  const boards = readJson('boards.json');
  if (!boards) { console.error('No saved study in the data folder yet. Run: node src/study.mjs'); process.exit(1); }
  const results = buildResults({boards, books: readJson('books.json'), ages: readJson('ages.json'), feed: readJson('feed.json'), marks: readJson('marks.json'), usage: readJson('usage.json')});
  writeFileSync(file('results.json'), JSON.stringify(results, null, 1));
  printBoards(boards.boards);
  const e = results.entry;
  if (e) {
    say(`ENTRY  | ${e.all.buys.toLocaleString('en-US')} buys from ${e.all.wallets.toLocaleString('en-US')} wallets, ${e.all.settledBuys.toLocaleString('en-US')} in markets that are decided`);
    for (const g of e.groups) say(`ENTRY  | ${g.id.padEnd(12)} | ${String(g.settledBuys).padStart(6)} decided buys | paid ${usd(g.settledCost).padStart(11)} | got back ${usd(g.payout).padStart(11)} | ${g.returnPct === null ? 'n/a' : `${g.returnPct >= 0 ? '+' : ''}${g.returnPct.toFixed(1)}%`}`);
  }
  say(`SAVED  | ${file('results.json')}`);
  return results;
}

if (reportOnly) { report(); process.exit(0); }

const key = loadKey();
const client = createClient({key, requestsPerMinute: settings.requestsPerMinute});
const started = Date.now();

try {
  // ---- 1. the leaderboards: the 50 most profitable and the 50 busiest wallets, over four windows ----
  const boards = {takenAt: new Date().toISOString(), source: `GET /v1/traders/${VENUE}/leaderboard`, boards: {}};
  for (const by of ['profit', 'volume']) for (const window of WINDOWS) {
    const r = await client.get('leaderboards', `/v1/traders/${VENUE}/leaderboard`, {by, window, limit: 100});
    if (!r.ok) throw new Error(`The ${by}/${window} leaderboard answered ${r.status} ${r.code}`);
    boards.boards[`${by}-${window}`] = r.data || [];
  }
  printBoards(boards.boards);
  const swing = flips(boards.boards, 'day', 'month')[0];
  if (swing) say(`FLIP   | ${shortWallet(swing.wallet)} is ${swing.short > 0 ? 'up' : 'down'} ${usd(Math.abs(swing.short))} today and ${swing.long > 0 ? 'up' : 'down'} ${usd(Math.abs(swing.long))} this month`);
  if (quick) { say(`COST   | ${client.usage.requests} requests, ${client.usage.credits} credits. Nothing was saved (--quick).`); process.exit(0); }
  writeJson('boards.json', boards);

  // ---- 2. the books of the month's top earners and of its biggest losses on the busiest board ----
  const earners = (boards.boards['profit-month'] || []).slice(0, settings.books).map(row => ({...row, role: 'earner'}));
  const losers = [...(boards.boards['volume-month'] || [])].sort((a, b) => a.profitUsd - b.profitUsd).slice(0, 5).filter(row => row.profitUsd < 0).map(row => ({...row, role: 'loss'}));
  const books = {takenAt: new Date().toISOString(), source: `GET /v1/accounts/${VENUE}/{wallet}/positions`, maxPages: settings.bookPages, wallets: []};
  for (const row of [...earners, ...losers.filter(l => !earners.some(e => e.wallet === l.wallet))]) {
    const rows = []; let cursor = null, pages = 0, error = null;
    while (pages < settings.bookPages) {
      const r = await client.get('positions', `/v1/accounts/${VENUE}/${row.wallet}/positions`, {limit: 100, cursor}); pages++;
      if (!r.ok) { error = `${r.status} ${r.code}`; break; }
      rows.push(...(r.data || [])); cursor = r.nextCursor;
      if (!cursor || !(r.data || []).length) break;
    }
    books.wallets.push({wallet: row.wallet, displayName: row.displayName, role: row.role, monthProfit: row.profitUsd, monthVolume: row.volumeUsd, pages, partial: Boolean(cursor), error, rows});
    say(`BOOK   | ${shortWallet(row.wallet)} ${(handleOf(row.displayName, row.wallet) || '').slice(0, 18).padEnd(18)} | month ${usd(row.profitUsd).padStart(13)} | ${String(rows.length).padStart(3)} rows${cursor ? '+' : ' '} | dead tickets ${rows.filter(p => p.raw?.redeemable && Number(p.markPrice) === 0).length}`);
  }
  writeJson('books.json', books);

  // ---- 3. how old the wallets on the profit boards are ----
  const ages = {takenAt: new Date().toISOString(), source: `GET /v1/traders/${VENUE}/wallets/{wallet}`, profiles: {}};
  const onProfitBoards = [...new Set(WINDOWS.flatMap(window => (boards.boards[`profit-${window}`] || []).map(row => row.wallet)))];
  await pool(onProfitBoards, 4, async wallet => {
    const r = await client.get('profiles', `/v1/traders/${VENUE}/wallets/${wallet}`);
    ages.profiles[wallet] = r.ok ? {firstSeen: r.data?.stats?.firstSeen || null, walletAgeDays: r.data?.stats?.walletAgeDays ?? null, refreshState: r.data?.refreshState || null} : {error: `${r.status} ${r.code}`};
  });
  writeJson('ages.json', ages);
  say(`AGES   | ${onProfitBoards.length} wallets on the profit boards, ${Object.values(ages.profiles).filter(p => p.firstSeen).length} with a first-seen date`);

  // ---- 4. the scored-trade feed, by label ----
  let feed = resume ? readJson('feed.json') : null;
  if (!feed) {
    feed = {takenAt: new Date().toISOString(), source: 'GET /v1/traders/smart-money', pagesPerFeed: settings.pages, feeds: {}};
    for (const id of FEEDS) {
      const rows = []; let cursor = null, pages = 0, exhausted = false;
      while (pages < settings.pages) {
        const r = await client.get('feed', '/v1/traders/smart-money', {venue: VENUE, category: id === 'any' ? null : id, window: 'all', limit: 100, cursor}); pages++;
        if (!r.ok) throw new Error(`The feed answered ${r.status} ${r.code}`);
        for (const t of r.data || []) rows.push({marketId: t.marketId, outcomeId: t.outcomeId, tradeId: t.tradeId, ts: t.ts, wallet: t.wallet, side: t.side, price: t.price, amount: t.amount, usdSize: t.usdSize, categoryAtTrade: t.categoryAtTrade, tradeScore: t.tradeScore});
        cursor = r.nextCursor;
        if (!cursor || !(r.data || []).length) { exhausted = true; break; }
      }
      feed.feeds[id] = {pages, exhausted, rows};
      say(`FEED   | ${id.padEnd(6)} | ${String(rows.length).padStart(6)} trades in ${String(pages).padStart(3)} pages | ${rows.at(-1)?.ts?.slice(0, 16) || ''} to ${rows[0]?.ts?.slice(0, 16) || ''}${exhausted ? ' (all there is)' : ''}`);
    }
    writeJson('feed.json', feed);
  } else say(`FEED   | reusing the saved feed of ${feed.takenAt}`);

  // ---- 5. what each bought ticket turned into: the newest rows of every market's tape ----
  const wanted = [...new Set(Object.values(feed.feeds).flatMap(f => f.rows).filter(t => t.side === 'buy').map(t => t.marketId))].sort();
  const marks = (resume && readJson('marks.json')) || {takenAt: new Date().toISOString(), source: `GET /v1/traders/${VENUE}/markets/{marketId}/trades?limit=20`, marks: {}};
  // Market ids are hashes, so the first N in sorted order are an arbitrary slice, not the busiest or the newest.
  const todo = wanted.filter(id => !Object.hasOwn(marks.marks, id)).slice(0, Math.max(0, settings.markets - wanted.filter(id => Object.hasOwn(marks.marks, id)).length));
  say(`MARKS  | ${wanted.length} markets were bought in the sample; looking up ${todo.length}${todo.length < wanted.length ? ` (limit ${settings.markets})` : ''}`);
  let done = 0;
  await pool(todo, settings.parallel, async marketId => {
    const r = await client.get('market tapes', `/v1/traders/${VENUE}/markets/${marketId}/trades`, {limit: 20});
    if (r.ok) {
      const newest = [];
      for (const t of r.data || []) if (!newest.some(n => n.outcomeId === t.outcomeId)) newest.push({outcomeId: t.outcomeId, price: t.price, ts: t.ts});
      marks.marks[marketId] = newest;
    } else marks.marks[marketId] = null;
    if (++done % 250 === 0) { writeJson('marks.json', marks); say(`MARKS  | ${done} of ${todo.length}`); }
  });
  marks.finishedAt = new Date().toISOString();
  writeJson('marks.json', marks);

  const previous = resume ? readJson('usage.json') : null;
  writeJson('usage.json', {...client.usage, seconds: Math.round((Date.now() - started) / 1000), settings, ...(previous ? {earlierRun: previous} : {})});
  report();
  say(`COST   | ${client.usage.requests.toLocaleString('en-US')} requests, ${client.usage.credits.toLocaleString('en-US')} credits, ${Math.round((Date.now() - started) / 60000)} minutes. Predictefy's free plan includes 25,000 credits a month.`);
  say('NEXT   | node src/server.mjs');
} catch (error) {
  if (error instanceof PlanError) { say(`PLAN   | ${error.message}`); process.exit(2); }
  console.error(error.message);
  process.exit(1);
}
