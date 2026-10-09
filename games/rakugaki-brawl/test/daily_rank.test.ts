import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyKey, dailySeed, loadDailyBest, recordDaily } from '../src/daily.js';
import { enemyInkScale, loadRank, MAX_RANK, playerInkScale, recordClear, unlockedRank } from '../src/rank.js';

const mem = () => { const s: Record<string, string> = {}; return { getItem: (k: string) => s[k] ?? null, setItem: (k: string, v: string) => { s[k] = v; } }; };

test('daily seed is stable per day and differs between days', () => {
  assert.equal(dailyKey(new Date('2026-10-09T23:59:00Z')), '2026-10-09');
  assert.equal(dailySeed('2026-10-09'), dailySeed('2026-10-09'));
  assert.notEqual(dailySeed('2026-10-09'), dailySeed('2026-10-10'));
  assert.ok(dailySeed('2026-10-09') >= 0 && dailySeed('2026-10-09') < 100000);
});

test('daily best keeps the better result', () => {
  const kv = mem();
  assert.equal(loadDailyBest(kv, '2026-10-09'), null);
  recordDaily(kv, { key: '2026-10-09', wins: 3, rounds: 5, cleared: false });
  recordDaily(kv, { key: '2026-10-09', wins: 2, rounds: 9, cleared: false });
  assert.equal(loadDailyBest(kv, '2026-10-09')?.wins, 3);
  recordDaily(kv, { key: '2026-10-09', wins: 3, rounds: 7, cleared: false });
  assert.equal(loadDailyBest(kv, '2026-10-09')?.rounds, 7);
});

test('rank ladder: scales, unlock by clearing, capped', () => {
  const kv = mem();
  assert.equal(unlockedRank(loadRank(kv)), 0);
  assert.equal(playerInkScale(0), 1);
  assert.ok(playerInkScale(5) < 1 && enemyInkScale(5) > 1);
  assert.equal(unlockedRank(recordClear(kv, 0)), 1);
  assert.equal(unlockedRank(recordClear(kv, 3)), 4);
  assert.equal(unlockedRank(recordClear(kv, 1)), 4); // never goes down
  assert.equal(unlockedRank(recordClear(kv, 99)), MAX_RANK);
});
