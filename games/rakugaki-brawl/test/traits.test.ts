import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze } from '../src/analyze.js';
import { ARENA_W, makeFighter, simulate } from '../src/battle.js';
import { isClosedLoop, segmentParts, traits } from '../src/parts.js';
import type { Drawing, Stroke } from '../src/types.js';

const circle = (cx: number, cy: number, r: number, width = 8): Stroke => {
  const points = [];
  for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2; points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  return { color: 'black', width, points };
};
const line = (x1: number, y1: number, x2: number, y2: number, width = 4): Stroke => ({ color: 'black', width, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] });
const dwg = (...strokes: Stroke[]): Drawing => ({ strokes, width: 480, height: 360 });

test('closed loop detection', () => {
  assert.equal(isClosedLoop(circle(200, 150, 60)), true);
  assert.equal(isClosedLoop(line(0, 0, 100, 100)), false);
  const open = circle(200, 150, 60); open.points = open.points.slice(0, 20); // 60% of a circle
  assert.equal(isClosedLoop(open), false);
});

test('traits: body ring is a shield, small inner loops are eyes, limbs counted', () => {
  const d = dwg(circle(200, 150, 60), circle(185, 135, 6, 3), circle(215, 135, 6, 3), line(170, 205, 165, 280), line(230, 205, 235, 280), line(255, 150, 330, 120));
  const t = traits(d, segmentParts(d));
  assert.deepEqual(t, { loops: 1, eyes: 2, legs: 2, arms: 1 });
  const s = analyze(d);
  assert.equal(s.armor, 1);
  assert.equal(s.critBonus, 0.08);
});

test('traits feed stats: legs speed up, arms hit harder, loops armour up to 3', () => {
  const plain = analyze(dwg(line(100, 100, 300, 100, 8)));
  const legs = analyze(dwg(line(100, 100, 300, 100, 8), line(150, 104, 148, 160, 4), line(250, 104, 252, 160, 4)));
  assert.ok(legs.spd > plain.spd);
  assert.equal(legs.traits.legs, 2);
  const rings = analyze(dwg(circle(100, 100, 30), circle(200, 100, 30), circle(300, 100, 30), circle(400, 100, 30)));
  assert.equal(rings.armor, 3);
});

test('armour reduces every hit by its value but never below 1', () => {
  const sword = dwg(line(100, 100, 300, 100, 8));
  const tank = dwg(circle(200, 150, 70, 8));
  const a = makeFighter('a', sword, 60), b = makeFighter('b', tank, ARENA_W - 60);
  assert.equal(b.stats.armor, 1);
  const r = simulate(a, b, 9);
  const hitsOnB = r.events.filter((e) => e.kind === 'hit' && e.from === 'a');
  assert.ok(hitsOnB.length > 0);
  for (const e of hitsOnB) if (e.kind === 'hit') assert.ok(e.dmg >= 1);
  // same fight with armour removed deals strictly more total damage
  b.stats.armor = 0;
  const a2 = makeFighter('a', sword, 60), b2 = makeFighter('b', tank, ARENA_W - 60); b2.stats.armor = 0;
  const r2 = simulate(a2, b2, 9);
  const total = (res: typeof r) => res.events.filter((e) => e.kind === 'hit' && e.from === 'a').reduce((n, e) => n + (e.kind === 'hit' ? e.dmg : 0), 0);
  assert.ok(total(r2) > total(r) || r2.events.length !== r.events.length);
});

test('tiny eye loops count as eyes and never as spikes', () => {
  const eye = circle(185, 135, 5, 3); eye.points = eye.points.filter((_, i) => i % 3 === 0); // coarse 11-gon
  const d = dwg(circle(200, 150, 60), eye, circle(215, 135, 5, 3));
  const s = analyze(d);
  assert.equal(s.traits.eyes, 2);
  assert.equal(s.spikes, 0);
});
