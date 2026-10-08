import assert from 'node:assert/strict';
import { test } from 'node:test';
import { afterWave, idleBudget, loadIdle, newIdle, saveIdle } from '../src/idle.js';
import { inkBudget } from '../src/run.js';

test('idle budget ramps every two waves and plateaus at round 10', () => {
  assert.equal(idleBudget(1), inkBudget(1));
  assert.equal(idleBudget(2), inkBudget(1));
  assert.equal(idleBudget(3), inkBudget(2));
  assert.equal(idleBudget(99), inkBudget(10));
});

test('afterWave tracks wins and streaks', () => {
  let s = newIdle(1);
  s = afterWave(s, 'a'); s = afterWave(s, 'a'); s = afterWave(s, 'b'); s = afterWave(s, 'a');
  assert.equal(s.wave, 5); assert.equal(s.wins, 3); assert.equal(s.streak, 1); assert.equal(s.bestStreak, 2);
});

test('idle state round-trips through storage and rejects junk', () => {
  const store: Record<string, string> = {};
  const kv = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
  assert.equal(loadIdle(kv), null);
  const s = afterWave(newIdle(42), 'a');
  saveIdle(kv, s);
  assert.deepEqual(loadIdle(kv), s);
  store['rakugaki-brawl.idle.v1'] = '{"wave":"x"}';
  assert.equal(loadIdle(kv), null);
});
