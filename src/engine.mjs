// Pure analysis functions. No network and no file access, so every number on the results page can be tested.

export const WINDOWS = ['day', 'week', 'month', 'all'];
export const GROUPS = ['bot', 'whale', 'fresh', 'fish', 'unclassified'];
// A share pays $1 or $0. A last trade this close to either end is treated as decided.
export const SETTLED_HIGH = 0.985, SETTLED_LOW = 0.015;
export const BUCKETS = [
  {id: 'longshot', label: 'under 20¢', from: 0, to: 0.2},
  {id: 'low', label: '20–40¢', from: 0.2, to: 0.4},
  {id: 'coin', label: '40–60¢', from: 0.4, to: 0.6},
  {id: 'high', label: '60–80¢', from: 0.6, to: 0.8},
  {id: 'favourite', label: '80¢ and up', from: 0.8, to: 1.0001},
];

const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
const sum = (rows, pick) => rows.reduce((total, row) => total + num(pick(row)), 0);

export const shortWallet = wallet => (wallet && wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet || '');

// Polymarket gives a wallet without a chosen name a display name made of its address and a timestamp. That is not a handle.
export function handleOf(displayName, wallet) {
  const name = String(displayName || '').trim();
  if (!name || /^0x[0-9a-f]{20,}/i.test(name) || (wallet && name.toLowerCase().startsWith(String(wallet).toLowerCase().slice(0, 12)))) return null;
  return name;
}

// ---- leaderboards ----

// One board of up to 50 rows: {wallet, displayName, rank, profitUsd, volumeUsd}.
export function boardStats(rows) {
  const list = (rows || []).filter(row => row && row.wallet);
  const byProfit = [...list].sort((a, b) => num(b.profitUsd) - num(a.profitUsd));
  const profit = sum(list, row => row.profitUsd), volume = sum(list, row => row.volumeUsd);
  const inRed = list.filter(row => num(row.profitUsd) < 0), inProfit = list.filter(row => num(row.profitUsd) > 0);
  const gains = sum(inProfit, row => row.profitUsd), losses = sum(inRed, row => row.profitUsd);
  const top = count => sum(byProfit.slice(0, count), row => row.profitUsd);
  return {
    wallets: list.length, profit, volume, gains, losses,
    inRed: inRed.length, inProfit: inProfit.length, flat: list.length - inRed.length - inProfit.length,
    shareInRed: list.length ? inRed.length / list.length : 0,
    best: byProfit[0] ? num(byProfit[0].profitUsd) : 0,
    worst: byProfit.length ? num(byProfit.at(-1).profitUsd) : 0,
    last: byProfit.length ? num(byProfit.at(-1).profitUsd) : 0,
    top10: top(10), top10Share: gains > 0 ? top(10) / gains : 0,
    // Cents made or lost for every dollar traded, across the whole board.
    centsPerDollar: volume > 0 ? profit / volume * 100 : null,
    // How much of the board's losses its five biggest losses account for.
    worst5: sum(byProfit.slice(-5), row => Math.min(0, num(row.profitUsd))),
    worst5Share: losses < 0 ? sum(byProfit.slice(-5), row => Math.min(0, num(row.profitUsd))) / losses : 0,
  };
}

// boards: {'profit-day': rows, 'volume-day': rows, ...}. Returns one summary per window.
export function windowSummaries(boards) {
  return WINDOWS.map(window => {
    const earners = boards[`profit-${window}`] || [], busiest = boards[`volume-${window}`] || [];
    const onEarners = new Set(earners.map(row => row.wallet));
    return {window, earners: boardStats(earners), busiest: boardStats(busiest), onBoth: busiest.filter(row => onEarners.has(row.wallet)).length};
  });
}

// Every wallet seen on any board, with the profit each window shows for it (when a board for that window lists it).
export function walletsAcrossWindows(boards) {
  const wallets = new Map();
  for (const [key, rows] of Object.entries(boards)) {
    const window = key.split('-')[1];
    for (const row of rows || []) {
      const entry = wallets.get(row.wallet) || {wallet: row.wallet, handle: handleOf(row.displayName, row.wallet), profit: {}, volume: {}, ranks: {}};
      entry.profit[window] = num(row.profitUsd); entry.volume[window] = num(row.volumeUsd);
      entry.ranks[key] = row.rank; entry.handle = entry.handle || handleOf(row.displayName, row.wallet);
      wallets.set(row.wallet, entry);
    }
  }
  return [...wallets.values()];
}

// Wallets that are up over one window and down over another, largest swing first.
export function flips(boards, shortWindow = 'day', longWindow = 'month') {
  return walletsAcrossWindows(boards)
    .filter(w => shortWindow in w.profit && longWindow in w.profit && Math.sign(w.profit[shortWindow]) * Math.sign(w.profit[longWindow]) < 0)
    .map(w => ({wallet: w.wallet, handle: w.handle, short: w.profit[shortWindow], long: w.profit[longWindow], ranks: w.ranks}))
    .sort((a, b) => Math.abs(b.long) - Math.abs(a.long));
}

// ---- books (account positions) ----

// rows: normalized position rows with the venue's own fields under raw. A ticket is dead when its market has settled
// and the share is worth nothing; it stays in the wallet because there is nothing to collect.
export function bookStats(rows) {
  const list = rows || [];
  const value = row => num(row.size) * num(row.markPrice);
  const paid = row => num(row.raw?.initialValue ?? num(row.size) * num(row.avgEntryPrice));
  const dead = list.filter(row => row.raw?.redeemable && num(row.markPrice) === 0);
  const live = list.filter(row => !row.raw?.redeemable && value(row) >= 1);
  const unclaimed = list.filter(row => row.raw?.redeemable && num(row.markPrice) > 0);
  return {
    rows: list.length,
    paper: sum(list, row => row.unrealizedPnl),
    deadTickets: dead.length, deadPaid: sum(dead, paid),
    liveBets: live.length, liveValue: sum(live, value), livePaper: sum(live, row => row.unrealizedPnl),
    unclaimedWins: unclaimed.length, unclaimedValue: sum(unclaimed, value),
  };
}

// ---- wallet ages (wallet profiles) ----

export function ageStats(firstSeenList, now) {
  const days = firstSeenList.map(ts => (now - Date.parse(ts)) / 864e5).filter(Number.isFinite).sort((a, b) => a - b);
  if (!days.length) return {known: 0, median: null, under7: 0, under30: 0, over365: 0};
  return {known: days.length, median: days[Math.floor((days.length - 1) / 2)], under7: days.filter(d => d < 7).length, under30: days.filter(d => d < 30).length, over365: days.filter(d => d >= 365).length};
}

// ---- the entry study (scored-trade feed, marked with each market's last trades) ----

export const bucketOf = price => BUCKETS.find(bucket => price >= bucket.from && price < bucket.to)?.id || null;

// What one share of this outcome is worth: 1, 0, or null while the market is still trading in between.
export function settle(lastPrice) {
  if (lastPrice == null || !Number.isFinite(Number(lastPrice))) return null;
  if (lastPrice >= SETTLED_HIGH) return 1;
  if (lastPrice <= SETTLED_LOW) return 0;
  return null;
}

// tapeRows: the newest rows of one market's tape, newest first. Returns the last traded price of the outcome.
// A Polymarket market has two outcomes whose prices add to one, so the other side's last trade also answers it.
export function lastPriceOf(tapeRows, outcomeId) {
  const rows = tapeRows || [];
  const usable = row => Number.isFinite(Number(row.price)) && Number(row.price) > 0;
  const own = rows.find(row => row.outcomeId === outcomeId && usable(row));
  const other = rows.find(row => row.outcomeId !== outcomeId && usable(row));
  if (own && other) return Date.parse(own.ts) >= Date.parse(other.ts) ? Number(own.price) : 1 - Number(other.price);
  if (own) return Number(own.price);
  if (other) return 1 - Number(other.price);
  return null;
}

export const tradeKey = trade => `${trade.tradeId}|${trade.wallet}|${trade.outcomeId}|${trade.side}`;

const tally = () => ({buys: 0, cost: 0, shares: 0, settledBuys: 0, settledCost: 0, settledShares: 0, payout: 0, wonBuys: 0, priceSum: 0, openBuys: 0, openCost: 0, unknownBuys: 0});
function add(t, trade, outcome, known) {
  const cost = num(trade.price) * num(trade.amount);
  t.buys++; t.cost += cost; t.shares += num(trade.amount);
  if (outcome === null) { if (known) { t.openBuys++; t.openCost += cost; } else t.unknownBuys++; return; }
  t.settledBuys++; t.settledCost += cost; t.settledShares += num(trade.amount); t.payout += outcome * num(trade.amount); t.wonBuys += outcome; t.priceSum += num(trade.price);
}
function finish(t) {
  return {
    ...t,
    // Dollars back for every dollar paid, on buys whose market is decided.
    returnPct: t.settledCost > 0 ? (t.payout / t.settledCost - 1) * 100 : null,
    result: t.payout - t.settledCost,
    // Average price paid per share, and how often a share actually paid. A fair price would make these equal.
    paid: t.settledShares > 0 ? t.settledCost / t.settledShares : null,
    won: t.settledShares > 0 ? t.payout / t.settledShares : null,
    // Counting every buy once, whatever its size: how many won, and the average price they were bought at.
    winRate: t.settledBuys > 0 ? t.wonBuys / t.settledBuys : null,
    meanPrice: t.settledBuys > 0 ? t.priceSum / t.settledBuys : null,
  };
}

// trades: feed rows. marks: {marketId: tapeRows | null}. Only buys are scored: each one is a ticket bought at a price,
// and the question is what that ticket paid. Sells are counted and left out.
export function entryStudy(trades, marks) {
  const seen = new Set(), groups = new Map(), wallets = new Map(), buyers = new Set();
  let sells = 0, duplicates = 0, from = null, to = null;
  const group = id => { if (!groups.has(id)) groups.set(id, {id, total: tally(), buckets: new Map(BUCKETS.map(b => [b.id, tally()])), wallets: new Set(), from: null, to: null, decidedFrom: null, decidedTo: null}); return groups.get(id); };
  for (const trade of trades) {
    const key = tradeKey(trade);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    if (trade.side !== 'buy') { sells++; continue; }
    const price = num(trade.price);
    if (!(price > 0 && price < 1) || !(num(trade.amount) > 0)) continue;
    const g = group(GROUPS.includes(trade.categoryAtTrade) ? trade.categoryAtTrade : 'unclassified');
    const known = Object.hasOwn(marks, trade.marketId) && marks[trade.marketId] !== null;
    const outcome = known ? settle(lastPriceOf(marks[trade.marketId], trade.outcomeId)) : null;
    add(g.total, trade, outcome, known); add(g.buckets.get(bucketOf(price)), trade, outcome, known);
    g.wallets.add(trade.wallet); buyers.add(trade.wallet);
    if (!g.from || trade.ts < g.from) g.from = trade.ts;
    if (!g.to || trade.ts > g.to) g.to = trade.ts;
    if (!from || trade.ts < from) from = trade.ts;
    if (!to || trade.ts > to) to = trade.ts;
    if (outcome !== null) {
      if (!g.decidedFrom || trade.ts < g.decidedFrom) g.decidedFrom = trade.ts;
      if (!g.decidedTo || trade.ts > g.decidedTo) g.decidedTo = trade.ts;
      const w = wallets.get(trade.wallet) || {group: g.id, buys: 0, cost: 0, payout: 0};
      w.buys++; w.cost += price * num(trade.amount); w.payout += outcome * num(trade.amount); wallets.set(trade.wallet, w);
    }
  }
  const all = {id: 'all', total: tally(), buckets: new Map(BUCKETS.map(b => [b.id, tally()]))};
  for (const g of groups.values()) {
    for (const k of Object.keys(all.total)) all.total[k] += g.total[k];
    for (const b of BUCKETS) for (const k of Object.keys(all.total)) all.buckets.get(b.id)[k] += g.buckets.get(b.id)[k];
  }
  const shape = g => ({id: g.id, ...finish(g.total), from: g.from, to: g.to, decidedFrom: g.decidedFrom ?? null, decidedTo: g.decidedTo ?? null, buckets: BUCKETS.map(b => ({id: b.id, label: b.label, ...finish(g.buckets.get(b.id))}))});
  // Wallets with at least five decided buys in the sample: did those tickets pay back what they cost?
  const judged = [...wallets.values()].filter(w => w.buys >= 5);
  const walletView = id => { const list = judged.filter(w => id === 'all' || w.group === id); return {wallets: list.length, behind: list.filter(w => w.payout < w.cost).length}; };
  return {
    from, to, rows: seen.size, sells, duplicates,
    all: {...shape(all), from, to, decidedFrom: [...groups.values()].map(g => g.decidedFrom).filter(Boolean).sort()[0] || null, decidedTo: [...groups.values()].map(g => g.decidedTo).filter(Boolean).sort().at(-1) || null, wallets: buyers.size, judged: walletView('all')},
    groups: GROUPS.filter(id => groups.has(id)).map(id => ({...shape(groups.get(id)), wallets: groups.get(id).wallets.size, judged: walletView(id)})),
  };
}

// ---- everything the results page shows, from the saved raw responses ----

const slimBoard = rows => (rows || []).map(row => ({wallet: row.wallet, short: shortWallet(row.wallet), handle: handleOf(row.displayName, row.wallet), rank: row.rank, profit: num(row.profitUsd), volume: num(row.volumeUsd)}));

export function buildResults({boards, books, ages, feed, marks, usage, now = Date.now()}) {
  const results = {generatedAt: new Date(now).toISOString(), takenAt: {boards: boards?.takenAt || null, books: books?.takenAt || null, ages: ages?.takenAt || null, feed: feed?.takenAt || null, marks: marks?.takenAt || null}, usage: usage || null};
  const raw = boards?.boards || {};
  results.windows = windowSummaries(raw);
  results.boards = Object.fromEntries(Object.entries(raw).map(([key, rows]) => [key, slimBoard(rows)]));
  results.flips = {dayVsMonth: flips(raw, 'day', 'month').slice(0, 12), weekVsMonth: flips(raw, 'week', 'month').slice(0, 12), monthVsAll: flips(raw, 'month', 'all').slice(0, 12)};
  if (books?.wallets) {
    results.books = books.wallets.map(book => {
      const dead = (book.rows || []).filter(row => row.raw?.redeemable && num(row.markPrice) === 0).sort((a, b) => num(b.raw?.initialValue) - num(a.raw?.initialValue));
      return {
        wallet: book.wallet, short: shortWallet(book.wallet), handle: handleOf(book.displayName, book.wallet), role: book.role,
        monthProfit: num(book.monthProfit), monthVolume: num(book.monthVolume), pages: book.pages, partial: Boolean(book.partial), error: book.error || null,
        ...bookStats(book.rows),
        biggestDead: dead.slice(0, 3).map(row => ({title: row.raw?.title || '', outcome: row.raw?.outcome || '', paid: num(row.raw?.initialValue), avg: num(row.avgEntryPrice), shares: num(row.size), endDate: row.raw?.endDate || null})),
      };
    });
  }
  if (ages?.profiles) {
    results.ages = WINDOWS.map(window => {
      const wallets = (raw[`profit-${window}`] || []).map(row => row.wallet);
      const seen = wallets.map(wallet => ages.profiles[wallet]?.firstSeen).filter(Boolean);
      return {window, wallets: wallets.length, ...ageStats(seen, Date.parse(ages.takenAt || results.generatedAt)), days: seen.map(ts => Math.round((Date.parse(ages.takenAt || results.generatedAt) - Date.parse(ts)) / 864e5)).sort((a, b) => a - b)};
    });
  }
  if (feed?.feeds) {
    const trades = Object.values(feed.feeds).flatMap(f => f.rows || []);
    const known = marks?.marks || {};
    results.entry = entryStudy(trades, known);
    results.entry.feeds = Object.fromEntries(Object.entries(feed.feeds).map(([id, f]) => [id, {pages: f.pages, rows: (f.rows || []).length, exhausted: Boolean(f.exhausted), from: (f.rows || []).at(-1)?.ts || null, to: (f.rows || [])[0]?.ts || null}]));
    const wanted = new Set(trades.filter(t => t.side === 'buy').map(t => t.marketId));
    const read = [...wanted].filter(id => Object.hasOwn(known, id));
    results.entry.markets = {inSample: wanted.size, read: read.length, answered: read.filter(id => known[id] !== null).length, decided: read.filter(id => known[id] && known[id].some(row => settle(Number(row.price)) !== null)).length};
  }
  return results;
}
