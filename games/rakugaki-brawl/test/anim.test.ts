import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ATTACK_LEAD, ATTACK_TAIL, attackPose, hitPose, koPose, poseAt, walkPose } from '../src/anim.js';
import type { BattleEvent } from '../src/battle.js';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

test('attack starts and ends at rest and lunges forward at the landing frame', () => {
  const start = attackPose(0);
  assert.ok(near(start.dx, 0) && near(start.sx, 1) && near(start.rot, 0));
  const land = ATTACK_LEAD / (ATTACK_LEAD + ATTACK_TAIL);
  const atLand = attackPose(land - 1e-9);
  assert.ok(atLand.dx > 40, 'lunges forward');
  assert.ok(atLand.sx > 1.2 && atLand.sy < 0.85, 'stretches');
  const endPose = attackPose(0.999);
  assert.ok(Math.abs(endPose.dx) < 1 && Math.abs(endPose.rot) < 0.01);
  // wind-up leans back
  assert.ok(attackPose(land * 0.5).dx < 0);
});

test('hit reaction knocks back and squashes; big hits spin a full turn', () => {
  const small = hitPose(0, false);
  assert.ok(small.dx < 0 && small.sx > 1 && small.sy < 1);
  const big = hitPose(0.999, true);
  assert.ok(near(big.rot, -Math.PI * 2, 1e-3));
  assert.ok(near(hitPose(0.999, false).dx, 0, 1e-3));
});

test('knock-out topples to -90 degrees', () => {
  assert.ok(near(koPose(1).rot, -Math.PI / 2));
  assert.ok(near(koPose(0).rot, 0));
});

test('poseAt picks attack, hit and KO from the event log', () => {
  const events: BattleEvent[] = [
    { t: 1.0, kind: 'hit', from: 'a', dmg: 5, crit: false, mult: 1 },
    { t: 2.0, kind: 'end', winner: 'a' },
  ];
  // a is winding up at t = 0.9
  const windup = poseAt(events, 'a', 0.9, false);
  assert.ok(windup.dx < 0);
  // b is being hit at t = 1.05
  const hit = poseAt(events, 'b', 1.05, false);
  assert.ok(hit.dx < 0 && hit.sx > 1);
  // b walks before anything happens
  assert.deepEqual(poseAt(events, 'b', 0.2, true), walkPose(0.2));
  // after the end the loser falls, the winner keeps idling
  assert.ok(poseAt(events, 'b', 2.6, false).rot < -1.5);
  assert.ok(Math.abs(poseAt(events, 'a', 2.6, false).rot) < 0.01);
});
