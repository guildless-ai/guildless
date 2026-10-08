import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze, countSpikes, elementMultiplier, totalInk } from '../src/analyze.js';
import type { Drawing, Stroke } from '../src/types.js';

const line = (len: number, width = 8, color: Stroke['color'] = 'black'): Stroke => ({
  points: [{ x: 0, y: 0 }, { x: len, y: 0 }], width, color,
});
const dwg = (...strokes: Stroke[]): Drawing => ({ strokes, width: 480, height: 360 });

test('ink is length times width', () => {
  assert.equal(totalInk(dwg(line(100, 8))), 800);
  assert.equal(totalInk(dwg(line(100, 4), line(50, 4))), 600);
});

test('a dot still costs ink', () => {
  assert.equal(totalInk(dwg({ points: [{ x: 1, y: 1 }], width: 8, color: 'black' })), 8);
});

test('zigzag has spikes, a straight line has none', () => {
  const zig: Stroke = { color: 'black', width: 4, points: [
    { x: 0, y: 0 }, { x: 20, y: 40 }, { x: 40, y: 0 }, { x: 60, y: 40 }, { x: 80, y: 0 },
  ] };
  assert.equal(countSpikes(zig), 3);
  assert.equal(countSpikes(line(200)), 0);
});

test('jitter does not count as spikes', () => {
  const pts = [];
  for (let x = 0; x < 100; x += 2) pts.push({ x, y: (x % 4 === 0 ? 0 : 1) });
  assert.equal(countSpikes({ color: 'black', width: 4, points: pts }), 0);
});

test('more ink means more hp but slower', () => {
  const light = analyze(dwg(line(50, 4)));
  const heavy = analyze(dwg(line(300, 14)));
  assert.ok(heavy.hp > light.hp);
  assert.ok(heavy.spd < light.spd);
});

test('spiky doodle hits harder than a round one of equal ink', () => {
  const zig: Stroke = { color: 'black', width: 4, points: [
    { x: 0, y: 0 }, { x: 20, y: 40 }, { x: 40, y: 0 }, { x: 60, y: 40 }, { x: 80, y: 0 }, { x: 100, y: 40 },
  ] };
  const round = analyze(dwg(line(totalInk(dwg(zig)) / 4, 4)));
  const spiky = analyze(dwg(zig));
  assert.ok(spiky.atk > round.atk);
});

test('wide doodle reaches further', () => {
  const wide = analyze(dwg(line(400)));
  const narrow = analyze(dwg(line(40)));
  assert.ok(wide.reach > narrow.reach);
});

test('element is the color with the most ink', () => {
  const s = analyze(dwg(line(100, 4, 'red'), line(50, 14, 'blue')));
  assert.equal(s.element, 'blue');
});

test('element triangle', () => {
  assert.equal(elementMultiplier('red', 'green'), 1.5);
  assert.equal(elementMultiplier('green', 'red'), 0.75);
  assert.equal(elementMultiplier('blue', 'red'), 1.5);
  assert.equal(elementMultiplier('black', 'red'), 1);
  assert.equal(elementMultiplier('red', 'red'), 1);
});
