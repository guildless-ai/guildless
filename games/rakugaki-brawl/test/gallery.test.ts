import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GALLERY_KEY, GALLERY_MAX, loadGallery, pickRival, saveWinner, type KV } from '../src/gallery.js';
import { mulberry32 } from '../src/rng.js';
import type { Drawing } from '../src/types.js';

const mem = (): KV & { store: Record<string, string> } => {
  const store: Record<string, string> = {};
  return { store, getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
};
const dwg = (len: number): Drawing => ({ width: 480, height: 360, strokes: [{ color: 'red', width: 8, points: [{ x: 10, y: 10 }, { x: 10 + len, y: 10 }] }] });

test('empty or corrupt storage loads as empty gallery', () => {
  const kv = mem();
  assert.deepEqual(loadGallery(kv), []);
  kv.store[GALLERY_KEY] = '{not json';
  assert.deepEqual(loadGallery(kv), []);
  kv.store[GALLERY_KEY] = JSON.stringify([{ code: 1 }, { code: 'x', round: 2, savedAt: 3 }]);
  assert.equal(loadGallery(kv).length, 1);
});

test('saveWinner appends, persists and caps the gallery', () => {
  const kv = mem();
  for (let i = 1; i <= GALLERY_MAX + 5; i++) saveWinner(kv, dwg(i * 10), i, i);
  const g = loadGallery(kv);
  assert.equal(g.length, GALLERY_MAX);
  assert.equal(g[0].round, 6);
  assert.equal(g.at(-1)?.round, GALLERY_MAX + 5);
});

test('pickRival returns a decodable drawing near the round, or null', () => {
  const kv = mem();
  saveWinner(kv, dwg(100), 3);
  saveWinner(kv, dwg(200), 9);
  const g = loadGallery(kv);
  const r = pickRival(g, 4, mulberry32(1));
  assert.ok(r);
  assert.equal(r.entry.round, 3);
  assert.equal(r.drawing.strokes[0].points[1].x, 110);
  assert.equal(pickRival(g, 6, mulberry32(1)), null);
  assert.equal(pickRival([], 1, mulberry32(1)), null);
});
