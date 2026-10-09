import assert from 'node:assert/strict';
import { test } from 'node:test';
import { limbPoseOf, type Phase } from '../src/anim.js';
import { posedDrawing, segmentParts } from '../src/parts.js';
import type { Drawing, Stroke } from '../src/types.js';

const circle = (cx: number, cy: number, r: number, width = 8): Stroke => {
  const points = [];
  for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2; points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  return { color: 'black', width, points };
};
const line = (x1: number, y1: number, x2: number, y2: number, width = 4): Stroke => ({ color: 'black', width, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] });

// Body circle at (200,150) r=60: bbox y 90..210. Two legs below, one arm sticking right, eyes inside.
const critter: Drawing = {
  width: 480, height: 360,
  strokes: [
    circle(200, 150, 60),
    line(170, 205, 165, 280),   // left leg
    line(230, 205, 235, 280),   // right leg
    line(255, 150, 330, 120),   // right arm
    circle(185, 135, 5, 3),     // eye
    circle(215, 135, 5, 3),     // eye
    line(180, 95, 190, 60),     // spike on top (not a limb)
  ],
};

test('segments a critter into body, two legs and one arm', () => {
  const parts = segmentParts(critter);
  assert.equal(parts.legs.length, 2);
  assert.equal(parts.arms.length, 1);
  assert.deepEqual(parts.legs.map((l) => l.stroke), [1, 2]);
  assert.equal(parts.arms[0].stroke, 3);
  assert.equal(parts.legs[0].side, -1);
  assert.equal(parts.legs[1].side, 1);
  // leg pivots at the top of each leg
  assert.deepEqual(parts.legs[0].pivot, { x: 170, y: 205 });
  // body bbox spans the circle
  assert.ok(parts.body.y <= 90.5 && parts.body.y + parts.body.h >= 209.5);
});

test('a single blob has no limbs and poses to itself', () => {
  const blob: Drawing = { width: 480, height: 360, strokes: [circle(200, 150, 60)] };
  const parts = segmentParts(blob);
  assert.equal(parts.legs.length + parts.arms.length, 0);
  assert.equal(posedDrawing(blob, parts, { legs: [], arms: [] }), blob);
});

test('posedDrawing rotates a leg about its pivot and leaves the body alone', () => {
  const parts = segmentParts(critter);
  const posed = posedDrawing(critter, parts, { legs: [Math.PI / 2, 0], arms: [0] });
  const leg = posed.strokes[1];
  assert.deepEqual(leg.points[0], { x: 170, y: 205 }); // pivot unchanged
  // the foot (75px below the pivot) swings toward +x
  assert.ok(leg.points[1].x > 170 + 70 && Math.abs(leg.points[1].y - 205) < 6);
  assert.deepEqual(posed.strokes[0], critter.strokes[0]);
  assert.deepEqual(posed.strokes[2], critter.strokes[2]); // angle 0 -> untouched
});

test('walking alternates legs and an attack whips the arms forward at landing', () => {
  const walk: Phase = { kind: 'walk', u: Math.PI / 18, big: false }; // sin(9u) = 1
  const w = limbPoseOf(walk, 2, 1);
  assert.ok(w.legs[0] > 0.4 && w.legs[1] < -0.4);
  assert.ok(w.arms[0] < 0);
  const windup = limbPoseOf({ kind: 'attack', u: 0.3, big: false }, 2, 2);
  assert.ok(windup.arms[0] < -0.5);
  const landing = limbPoseOf({ kind: 'attack', u: 0.624, big: false }, 2, 2);
  assert.ok(landing.arms[0] > 0.8);
  assert.deepEqual(limbPoseOf({ kind: 'ko', u: 1, big: false }, 1, 1), { legs: [0.8], arms: [1.2] });
});
