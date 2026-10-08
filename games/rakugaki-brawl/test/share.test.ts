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

test('rejects garbage and oversized input', () => {
  assert.throws(() => decodeDrawing('hello'), /not a Rakugaki Brawl code/);
  assert.throws(() => decodeDrawing(btoa('RB1.480x360.9,8,1,2,3,4')), /bad stroke header/);
  assert.throws(() => decodeDrawing(btoa('RB1.99999x360.')), /bad canvas size/);
  const huge: Drawing = { width: 480, height: 360, strokes: Array.from({ length: 201 }, () => ({ color: 'black' as const, width: 4, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })) };
  assert.throws(() => decodeDrawing(encodeDrawing(huge)), /too large/);
});
