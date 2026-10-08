import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_W, makeFighter } from '../src/battle.js';
import { applyPerks, BASE_MODIFIERS, offerPerks, PERKS } from '../src/perks.js';
import { mulberry32 } from '../src/rng.js';
import { inkBudget } from '../src/run.js';
import type { Drawing } from '../src/types.js';

const blob: Drawing = { width: 480, height: 360, strokes: [{ color: 'red', width: 8, points: [{ x: 50, y: 50 }, { x: 350, y: 50 }] }] };

test('no perks equals base modifiers', () => {
  assert.deepEqual(applyPerks([]), BASE_MODIFIERS);
});

test('perks stack', () => {
  const m = applyPerks(['atk', 'atk', 'ink', 'crit', 'reach']);
  assert.ok(Math.abs(m.atkMul - 1.44) < 1e-9);
  assert.equal(m.inkBonus, 900);
  assert.ok(Math.abs(m.critChance - 0.2) < 1e-9);
  assert.equal(m.reachBonus, 15);
  assert.equal(inkBudget(1, m.inkBonus), 6900);
});

test('crit chance is capped', () => {
  assert.equal(applyPerks(['crit', 'crit', 'crit', 'crit', 'crit', 'crit']).critChance, 0.6);
});

test('modifiers change fighter stats', () => {
  const plain = makeFighter('a', blob, 60);
  const buffed = makeFighter('a', blob, 60, applyPerks(['hp', 'atk', 'spd', 'reach']));
  assert.equal(buffed.stats.hp, Math.round(plain.stats.hp * 1.2));
  assert.equal(buffed.stats.atk, Math.round(plain.stats.atk * 1.2));
  assert.ok(buffed.stats.spd > plain.stats.spd);
  assert.equal(buffed.stats.reach, plain.stats.reach + 15);
  assert.equal(plain.x, 60);
  void ARENA_W;
});

test('offers three distinct perks deterministically', () => {
  const a = offerPerks(mulberry32(5));
  const b = offerPerks(mulberry32(5));
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((p) => p.id)).size, 3);
  for (const p of a) assert.equal(PERKS[p.id], p);
});
