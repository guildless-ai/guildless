import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_W, makeFighter, simulate } from '../src/battle.js';
import { generateEnemy } from '../src/enemy.js';
import { applyResult, inkBudget, newRun } from '../src/run.js';
import { analyze, totalInk } from '../src/analyze.js';
import type { Drawing } from '../src/types.js';

const blob = (ink: number, color: Drawing['strokes'][0]['color'] = 'black'): Drawing => ({
  width: 480, height: 360,
  strokes: [{ color, width: 8, points: [{ x: 100, y: 100 }, { x: 100 + ink / 8, y: 100 }] }],
});

test('simulation is deterministic for a seed', () => {
  const r1 = simulate(makeFighter('a', blob(800), 60), makeFighter('b', blob(800, 'red'), ARENA_W - 60), 42);
  const r2 = simulate(makeFighter('a', blob(800), 60), makeFighter('b', blob(800, 'red'), ARENA_W - 60), 42);
  assert.deepEqual(r1.events, r2.events);
});

test('battle always ends with an end event and a winner', () => {
  const r = simulate(makeFighter('a', blob(500), 60), makeFighter('b', blob(2000), ARENA_W - 60), 7);
  assert.equal(r.events.at(-1)?.kind, 'end');
  assert.ok(['a', 'b', 'draw'].includes(r.winner));
});

test('much bigger doodle beats a tiny one', () => {
  const r = simulate(makeFighter('a', blob(3000), 60), makeFighter('b', blob(100), ARENA_W - 60), 3);
  assert.equal(r.winner, 'a');
});

test('element advantage decides an otherwise equal fight', () => {
  // red beats green
  const r = simulate(makeFighter('a', blob(1000, 'red'), 60), makeFighter('b', blob(1000, 'green'), ARENA_W - 60), 5);
  assert.equal(r.winner, 'a');
});

test('generated enemies respect the ink budget roughly and are reproducible', () => {
  for (let round = 1; round <= 10; round++) {
    const e1 = generateEnemy(round, inkBudget(round), 123);
    const e2 = generateEnemy(round, inkBudget(round), 123);
    assert.deepEqual(e1, e2);
    const ink = totalInk(e1.drawing);
    assert.ok(ink > 0, 'has ink');
    assert.ok(ink <= inkBudget(round), `round ${round} ink ${ink} within budget ${inkBudget(round)}`);
    assert.ok(ink >= inkBudget(round) * 0.5, `round ${round} ink ${ink} uses at least half the budget`);
  }
});

test('run state: losing all lives ends the run, 10 rounds completes it', () => {
  let run = newRun(1);
  run = applyResult(run, 'b'); run = applyResult(run, 'b');
  assert.equal(run.lives, 1); assert.equal(run.over, false);
  run = applyResult(run, 'b');
  assert.equal(run.over, true);

  let run2 = newRun(1);
  for (let i = 0; i < 10; i++) run2 = applyResult(run2, 'a');
  assert.equal(run2.over, true); assert.equal(run2.wins, 10);
});

test('generated enemies carry readable traits (eyes, legs, arms) across seeds', () => {
  let eyes = 0, legs = 0, arms = 0, n = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    for (let round = 1; round <= 5; round++) {
      const e = generateEnemy(round, inkBudget(round), seed);
      const s = analyze(e.drawing);
      n++;
      if (s.traits.eyes > 0) eyes++;
      if (s.traits.legs > 0) legs++;
      if (s.traits.arms > 0) arms++;
      assert.ok(totalInk(e.drawing) <= inkBudget(round), `seed ${seed} round ${round} within budget`);
    }
  }
  assert.ok(eyes > n * 0.2, `eyes on ${eyes}/${n}`);
  assert.ok(legs > n * 0.3, `legs on ${legs}/${n}`);
  assert.ok(arms > n * 0.1, `arms on ${arms}/${n}`);
});

test('enemy name prefixes match the traits the player will see', () => {
  for (const seed of [11, 22, 33, 44, 55, 66, 77, 88]) {
    const e = generateEnemy(1, inkBudget(1), seed);
    const t = analyze(e.drawing).traits;
    if (e.name.startsWith('めだま')) assert.ok(t.eyes > 0, `${e.name} has eyes`);
    if (e.name.startsWith('むかで')) assert.ok(t.legs >= 4, `${e.name} has 4+ legs`);
    if (e.name.startsWith('あしつき')) assert.ok(t.legs > 0, `${e.name} has legs`);
    if (e.name.startsWith('うでつき')) assert.ok(t.arms > 0, `${e.name} has arms`);
  }
});
