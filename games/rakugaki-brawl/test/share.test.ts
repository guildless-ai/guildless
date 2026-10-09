import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeDrawing, encodeDrawing } from '../src/share.js';
import type { Drawing } from '../src/types.js';

const d: Drawing = {
  width: 480, height: 360,
  strokes: [
    { color: 'red', width: 8, points: [{ x: 10.4, y: 20.6 }, { x: 30, y: 40 }] },
    { color: 'blue', width: 14, points: [{ x: 100, y: 100 }] },
  ],
};

test('round-trips a drawing with rounded coordinates', () => {
  const back = decodeDrawing(encodeDrawing(d));
  assert.equal(back.width, 480);
  assert.equal(back.strokes.length, 2);
  assert.deepEqual(back.strokes[0].points, [{ x: 10, y: 21 }, { x: 30, y: 40 }]);
  assert.equal(back.strokes[1].color, 'blue');
  assert.equal(back.strokes[1].width, 14);
});

test('codes are URL safe and whitespace tolerant', () => {
  const code = encodeDrawing(d);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeDrawing(`  ${code}\n`), decodeDrawing(code));
});

test('rejects garbage, truncation and oversized input', () => {
  assert.throws(() => decodeDrawing('hello'), /not a Rakugaki Brawl code/);
  assert.throws(() => decodeDrawing('!!!'), /not a Rakugaki Brawl code/);
  const code = encodeDrawing(d);
  assert.throws(() => decodeDrawing(code.slice(0, 12)), /truncated|bad/);
  const huge: Drawing = { width: 480, height: 360, strokes: Array.from({ length: 201 }, () => ({ color: 'black' as const, width: 4, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })) };
  assert.equal(decodeDrawing(encodeDrawing(huge)).strokes.length, 200); // encoder caps, decoder accepts the cap
});

test('a long jittery stroke encodes much shorter than the old text format and stays within 3px', () => {
  const pts = [];
  for (let i = 0; i < 400; i++) pts.push({ x: 40 + i * 0.9 + Math.sin(i) * 0.6, y: 180 + Math.sin(i / 20) * 50 + Math.cos(i * 3) * 0.5 });
  const big: Drawing = { width: 480, height: 360, strokes: [{ color: 'black', width: 8, points: pts }] };
  const v2 = encodeDrawing(big);
  const v1 = Buffer.from(`RB1.480x360.0,8,${pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(',')}`).toString('base64url');
  assert.ok(v2.length < v1.length / 2.5, `v2 ${v2.length} vs v1 ${v1.length}`);
  const back = decodeDrawing(v2).strokes[0].points;
  // every original point is within 3px of some decoded point (simplification only drops near-duplicates)
  for (const p of pts) {
    const near = back.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= 3);
    assert.ok(near, `point ${p.x},${p.y} lost`);
  }
  assert.deepEqual(back[0], { x: Math.round(pts[0].x), y: Math.round(pts[0].y) });
  assert.deepEqual(back[back.length - 1], { x: Math.round(pts[399].x), y: Math.round(pts[399].y) });
});

test('still decodes legacy RB1 text codes', () => {
  const legacy = Buffer.from('RB1.480x360.1,8,10,20,30,40;2,14,100,100').toString('base64url');
  const back = decodeDrawing(legacy);
  assert.equal(back.strokes[0].color, 'red');
  assert.deepEqual(back.strokes[1].points, [{ x: 100, y: 100 }]);
});
