import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_W, LiveBattle, makeFighter, refreshFighter, simulate } from '../src/battle.js';
import type { Drawing } from '../src/types.js';

const blob = (ink: number, color: Drawing['strokes'][0]['color'] = 'black'): Drawing => ({
  width: 480, height: 360,
  strokes: [{ color, width: 8, points: [{ x: 100, y: 100 }, { x: 100 + ink / 8, y: 100 }] }],
});

test('LiveBattle stepped in small increments matches simulate()', () => {
  const whole = simulate(makeFighter('a', blob(900), 60), makeFighter('b', blob(800, 'red'), ARENA_W - 60), 11);
  const live = new LiveBattle(makeFighter('a', blob(900), 60), makeFighter('b', blob(800, 'red'), ARENA_W - 60), 11);
  while (!live.finished) live.step(0.013);
  assert.deepEqual(live.events, whole.events);
  assert.equal(live.winner, whole.winner);
});

test('fights last long enough to draw during them', () => {
  const r = simulate(makeFighter('a', blob(900), 60), makeFighter('b', blob(900, 'red'), ARENA_W - 60), 5);
  assert.ok(r.duration >= 6, `duration ${r.duration}`);
});

test('refreshFighter after drawing on the fighter raises max HP and heals by the gain', () => {
  const f = makeFighter('a', blob(600), 60);
  const before = f.stats.hp;
  f.hp = Math.floor(before / 2);
  const hpBefore = f.hp;
  f.drawing.strokes.push({ color: 'black', width: 12, points: [{ x: 100, y: 200 }, { x: 300, y: 200 }] });
  const { hpGain } = refreshFighter(f);
  assert.ok(f.stats.hp > before);
  assert.equal(hpGain, f.stats.hp - before);
  assert.equal(f.hp, hpBefore + hpGain);
});

test('mid-battle drawing changes the outcome of a live fight', () => {
  const mk = () => new LiveBattle(makeFighter('a', blob(700), 60), makeFighter('b', blob(900, 'red'), ARENA_W - 60), 9);
  const plain = mk();
  while (!plain.finished) plain.step(0.05);
  const boosted = mk();
  boosted.step(0.5);
  for (let i = 0; i < 6; i++) boosted.a.drawing.strokes.push({ color: 'black', width: 14, points: [{ x: 100, y: 120 + i * 20 }, { x: 420, y: 120 + i * 20 }] });
  refreshFighter(boosted.a);
  while (!boosted.finished) boosted.step(0.05);
  assert.equal(plain.winner, 'b');
  assert.equal(boosted.winner, 'a');
});
