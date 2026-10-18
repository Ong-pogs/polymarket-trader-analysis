import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boardStats, windowSummaries, walletsAcrossWindows, flips, bookStats, ageStats, bucketOf, settle, lastPriceOf, entryStudy, handleOf, shortWallet, buildResults} from './engine.mjs';

const row = (wallet, profitUsd, volumeUsd, rank = 1, displayName = wallet) => ({wallet, displayName, rank, profitUsd, volumeUsd});
const W = n => `0x${String(n).padStart(40, '0')}`;

test('a board counts wallets in the red and adds up profit and volume', () => {
  const s = boardStats([row(W(1), 100, 1000), row(W(2), -300, 5000), row(W(3), 0, 10), row(W(4), 50, 990)]);
  assert.equal(s.wallets, 4);
  assert.equal(s.inRed, 1); assert.equal(s.inProfit, 2); assert.equal(s.flat, 1);
  assert.equal(s.profit, -150); assert.equal(s.volume, 7000);
  assert.equal(s.gains, 150); assert.equal(s.losses, -300);
  assert.equal(s.best, 100); assert.equal(s.worst, -300);
  assert.ok(Math.abs(s.centsPerDollar - (-150 / 7000 * 100)) < 1e-9);
});

test('the top-ten share is measured against the gains only', () => {
  const rows = Array.from({length: 20}, (_, i) => row(W(i), 20 - i, 100));   // profits 20, 19, ... 1
  const s = boardStats(rows);
  assert.equal(s.top10, 20 + 19 + 18 + 17 + 16 + 15 + 14 + 13 + 12 + 11);
  assert.ok(Math.abs(s.top10Share - 155 / 210) < 1e-9);
});

test('a board with no volume has no cents-per-dollar figure, not zero', () => {
  assert.equal(boardStats([row(W(1), 10, 0)]).centsPerDollar, null);
  assert.equal(boardStats([]).wallets, 0);
});

test('window summaries count wallets that are on both boards', () => {
  const boards = {'profit-month': [row(W(1), 9, 1), row(W(2), 8, 1)], 'volume-month': [row(W(2), 8, 1), row(W(3), -5, 9)]};
  const month = windowSummaries(boards).find(s => s.window === 'month');
  assert.equal(month.onBoth, 1);
  assert.equal(month.busiest.inRed, 1);
  assert.equal(windowSummaries(boards).find(s => s.window === 'day').earners.wallets, 0);
});

test('a flip is a wallet up over one window and down over the other, biggest long-window swing first', () => {
  const boards = {
    'profit-day': [row(W(1), 500, 1), row(W(2), 40, 1), row(W(4), 10, 1)],
    'volume-month': [row(W(1), -9000, 1), row(W(2), -100, 1), row(W(3), -1, 1), row(W(4), 77, 1)],
  };
  const out = flips(boards, 'day', 'month');
  assert.deepEqual(out.map(f => f.wallet), [W(1), W(2)]);
  assert.equal(out[0].short, 500); assert.equal(out[0].long, -9000);
  // W(3) has no day figure, so nothing can be said about it.
  assert.ok(!out.some(f => f.wallet === W(3)));
});

test('a wallet on two boards for the same window is one wallet', () => {
  const boards = {'profit-week': [row(W(1), 5, 10, 3)], 'volume-week': [row(W(1), 5, 10, 7)]};
  const all = walletsAcrossWindows(boards);
  assert.equal(all.length, 1);
  assert.deepEqual(all[0].ranks, {'profit-week': 3, 'volume-week': 7});
});

test('an address with a timestamp is not treated as a handle', () => {
  const wallet = '0x2c335066fe58fe9237c3d3dc7b275c2a034a0563';
  assert.equal(handleOf('0x2c335066FE58fe9237c3d3Dc7b275C2a034a0563-1759935795465', wallet), null);
  assert.equal(handleOf('swisstony', wallet), 'swisstony');
  assert.equal(handleOf('', wallet), null);
  assert.equal(shortWallet(wallet), '0x2c33…0563');
});

test('a book separates dead tickets, live bets and wins not yet collected', () => {
  const rows = [
    {size: 1000, avgEntryPrice: 0.5, markPrice: 0, unrealizedPnl: -500, raw: {redeemable: true, initialValue: 500}},     // dead ticket
    {size: 200, avgEntryPrice: 0.4, markPrice: 1, unrealizedPnl: 120, raw: {redeemable: true, initialValue: 80}},       // win, not collected
    {size: 100, avgEntryPrice: 0.3, markPrice: 0.45, unrealizedPnl: 15, raw: {redeemable: false, initialValue: 30}},    // live bet
    {size: 0.5, avgEntryPrice: 0.3, markPrice: 0.45, unrealizedPnl: 0.07, raw: {redeemable: false}},                    // dust
  ];
  const s = bookStats(rows);
  assert.equal(s.deadTickets, 1); assert.equal(s.deadPaid, 500);
  assert.equal(s.unclaimedWins, 1); assert.equal(s.unclaimedValue, 200);
  assert.equal(s.liveBets, 1); assert.equal(s.liveValue, 45);
  assert.ok(Math.abs(s.paper - (-500 + 120 + 15 + 0.07)) < 1e-9);
});

test('wallet ages: median and counts, ignoring wallets without a date', () => {
  const now = Date.parse('2026-10-08T00:00:00Z');
  const s = ageStats(['2026-10-06T00:00:00Z', '2026-09-28T00:00:00Z', '2025-01-01T00:00:00Z', 'not a date'], now);
  assert.equal(s.known, 3); assert.equal(s.under7, 1); assert.equal(s.under30, 2); assert.equal(s.over365, 1);
  assert.equal(Math.round(s.median), 10);
  assert.equal(ageStats([], now).median, null);
});

test('prices fall into five buckets', () => {
  assert.equal(bucketOf(0.05), 'longshot'); assert.equal(bucketOf(0.2), 'low'); assert.equal(bucketOf(0.5), 'coin');
  assert.equal(bucketOf(0.79), 'high'); assert.equal(bucketOf(0.999), 'favourite');
});

test('a market is decided only when its last trade is at either end', () => {
  assert.equal(settle(0.999), 1); assert.equal(settle(0.985), 1);
  assert.equal(settle(0.001), 0); assert.equal(settle(0.015), 0);
  assert.equal(settle(0.5), null); assert.equal(settle(0.97), null); assert.equal(settle(null), null);
});

test('the other outcome\'s last trade answers for this one, and the newer of the two wins', () => {
  const tape = [{outcomeId: 'B', price: 0.999, ts: '2026-10-02T10:00:00Z'}, {outcomeId: 'A', price: 0.4, ts: '2026-10-02T09:00:00Z'}];
  assert.ok(Math.abs(lastPriceOf(tape, 'A') - 0.001) < 1e-9);
  assert.equal(lastPriceOf(tape, 'B'), 0.999);
  assert.ok(Math.abs(lastPriceOf([{outcomeId: 'B', price: 0.3, ts: '2026-10-02T10:00:00Z'}], 'A') - 0.7) < 1e-9);
  assert.equal(lastPriceOf([], 'A'), null);
});

const trade = (over = {}) => ({marketId: 'm1', outcomeId: 'A', tradeId: 't' + Math.random(), ts: '2026-10-01T00:00:00Z', wallet: W(1), side: 'buy', price: 0.5, amount: 100, categoryAtTrade: 'fish', ...over});
const decided = winner => [{outcomeId: winner, price: 0.999, ts: '2026-10-02T00:00:00Z'}];

test('a buy that won pays a dollar a share, a buy that lost pays nothing', () => {
  const trades = [trade({price: 0.4, amount: 100}), trade({outcomeId: 'B', price: 0.6, amount: 50, wallet: W(2)})];
  const fish = entryStudy(trades, {m1: decided('A')}).groups.find(g => g.id === 'fish');
  assert.equal(fish.settledBuys, 2); assert.equal(fish.wonBuys, 1);
  assert.equal(fish.settledCost, 40 + 30); assert.equal(fish.payout, 100);
  assert.ok(Math.abs(fish.returnPct - (100 / 70 - 1) * 100) < 1e-9);
  assert.equal(fish.winRate, 0.5);
});

test('buys in a market still trading, or one that was never looked up, are not scored', () => {
  const trades = [trade({marketId: 'open'}), trade({marketId: 'missing'}), trade({marketId: 'failed'}), trade({marketId: 'm1'})];
  const all = entryStudy(trades, {open: [{outcomeId: 'A', price: 0.55, ts: '2026-10-02T00:00:00Z'}], failed: null, m1: decided('B')}).all;
  assert.equal(all.buys, 4); assert.equal(all.settledBuys, 1); assert.equal(all.openBuys, 1); assert.equal(all.unknownBuys, 2);
  assert.equal(all.payout, 0); assert.equal(all.returnPct, -100);
});

test('sells are counted and left out, and a row that arrives twice is counted once', () => {
  const twice = trade({tradeId: 'same'});
  const s = entryStudy([twice, {...twice}, trade({side: 'sell'})], {m1: decided('A')});
  assert.equal(s.duplicates, 1); assert.equal(s.sells, 1); assert.equal(s.all.buys, 1);
});

test('paid and won are per share, so a fair price makes them equal', () => {
  // 100 shares at 20 cents and 100 at 20 cents; one of the two markets pays.
  const trades = [trade({price: 0.2, marketId: 'm1'}), trade({price: 0.2, marketId: 'm2'})];
  const bucket = entryStudy(trades, {m1: decided('A'), m2: decided('B')}).all.buckets.find(b => b.id === 'low');
  assert.equal(bucket.paid, 0.2); assert.equal(bucket.won, 0.5);
  assert.equal(bucket.settledBuys, 2);
});

test('a label the feed does not name goes in the unclassified group', () => {
  const s = entryStudy([trade({categoryAtTrade: 'unclassified'}), trade({categoryAtTrade: null}), trade({categoryAtTrade: 'whale'})], {m1: decided('A')});
  assert.equal(s.groups.find(g => g.id === 'unclassified').buys, 2);
  assert.equal(s.groups.find(g => g.id === 'whale').buys, 1);
  assert.ok(!s.groups.some(g => g.id === 'fish'));
});

test('a wallet is judged only with five decided buys or more', () => {
  const five = Array.from({length: 5}, (_, i) => trade({wallet: W(7), marketId: `x${i}`, price: 0.5}));
  const marks = Object.fromEntries(five.map((t, i) => [t.marketId, decided(i < 2 ? 'A' : 'B')]));   // 2 of 5 win: paid 250, got 200
  const s = entryStudy([...five, trade({wallet: W(8), marketId: 'x0'})], marks);
  assert.deepEqual(s.all.judged, {wallets: 1, behind: 1});
});

test('results carry the time each dataset was read and survive missing parts', () => {
  const boards = {takenAt: '2026-10-08T09:00:00.000Z', boards: {'profit-month': [row(W(1), 10, 5)], 'volume-month': [row(W(1), 10, 5), row(W(2), -4, 50)]}};
  const r = buildResults({boards, now: Date.parse('2026-10-08T10:00:00Z')});
  assert.equal(r.takenAt.boards, '2026-10-08T09:00:00.000Z');
  assert.equal(r.windows.find(w => w.window === 'month').busiest.inRed, 1);
  assert.equal(r.boards['volume-month'][1].short, shortWallet(W(2)));
  assert.equal(r.entry, undefined); assert.equal(r.books, undefined);
});
