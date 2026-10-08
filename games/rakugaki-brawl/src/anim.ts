import type { BattleEvent } from './battle.js';

/** A 2D-in-3D pose: pixel offsets, scale and roll, applied to a cutout. */
export interface Pose {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  /** Roll in radians, positive = leaning toward the opponent. */
  rot: number;
}

export const IDLE: Pose = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 };
export const ATTACK_LEAD = 0.25;   // seconds of wind-up before the hit lands
export const ATTACK_TAIL = 0.15;   // seconds of recovery after the hit
export const HIT_DURATION = 0.35;
export const KO_DURATION = 0.6;

const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
const easeIn = (u: number) => u * u;

/** Walking: bob up and down with a slight forward lean. */
export function walkPose(t: number): Pose {
  const bob = Math.abs(Math.sin(t * 9));
  return { dx: 0, dy: -bob * 6, sx: 1 - bob * 0.03, sy: 1 + bob * 0.05, rot: 0.08 };
}

/** Breathing idle when within reach and waiting on the cooldown. */
export function idlePose(t: number): Pose {
  const b = Math.sin(t * 4);
  return { dx: 0, dy: 0, sx: 1 + b * 0.015, sy: 1 - b * 0.015, rot: 0 };
}

/**
 * Attack over u in [0,1): wind-up (lean back, squash) -> lunge (stretch
 * forward, tilt) -> recover. The strike lands at u = LEAD / (LEAD + TAIL).
 */
export function attackPose(u: number, lunge = 46): Pose {
  const land = ATTACK_LEAD / (ATTACK_LEAD + ATTACK_TAIL);
  if (u < land * 0.6) {
    const v = u / (land * 0.6);
    return { dx: -10 * easeOut(v), dy: 0, sx: 1 - 0.12 * v, sy: 1 + 0.1 * v, rot: -0.25 * v };
  }
  if (u < land) {
    const v = (u - land * 0.6) / (land * 0.4);
    const e = easeIn(v);
    return { dx: -10 + (lunge + 10) * e, dy: -8 * Math.sin(v * Math.PI), sx: 1 - 0.12 + 0.37 * e, sy: 1 + 0.1 - 0.3 * e, rot: -0.25 + 0.7 * e };
  }
  const v = (u - land) / (1 - land);
  const e = easeOut(v);
  return { dx: lunge * (1 - e), dy: 0, sx: 1.25 - 0.25 * e, sy: 0.8 + 0.2 * e, rot: 0.45 * (1 - e) };
}

/** Hit reaction: knockback, squash, and a full spin on big hits. */
export function hitPose(u: number, big: boolean): Pose {
  const e = easeOut(u);
  const kb = (big ? 34 : 16) * (1 - e);
  const squash = (1 - u) * (big ? 0.35 : 0.2);
  return { dx: -kb, dy: big ? -40 * Math.sin(u * Math.PI) : 0, sx: 1 + squash, sy: 1 - squash, rot: big ? -Math.PI * 2 * e : -0.3 * (1 - u) };
}

/** Knock-out: topple over backwards and sink a little. */
export function koPose(u: number): Pose {
  const e = easeIn(Math.min(1, u));
  return { dx: -20 * e, dy: 10 * e, sx: 1, sy: 1, rot: -Math.PI / 2 * e };
}

export function blend(a: Pose, b: Pose, w: number): Pose {
  return { dx: a.dx + (b.dx - a.dx) * w, dy: a.dy + (b.dy - a.dy) * w, sx: a.sx + (b.sx - a.sx) * w, sy: a.sy + (b.sy - a.sy) * w, rot: a.rot + (b.rot - a.rot) * w };
}

/**
 * Pose of fighter `who` at replay time `t`, derived purely from the event
 * log so the 2D and 3D renderers animate identically. `moving` says whether
 * the fighter is still walking in (from the renderer's position tracking).
 */
export function poseAt(events: BattleEvent[], who: 'a' | 'b', t: number, moving: boolean): Pose {
  const end = events.find((e) => e.kind === 'end');
  if (end && end.kind === 'end' && t >= end.t && end.winner !== who && end.winner !== 'draw') {
    return koPose((t - end.t) / KO_DURATION);
  }
  // Latest relevant hit events: one we deal (attack anim) and one we take (hit anim).
  let attack: Pose | null = null;
  let hit: Pose | null = null;
  for (const e of events) {
    if (e.kind !== 'hit') continue;
    if (e.from === who) {
      const start = e.t - ATTACK_LEAD;
      if (t >= start && t < e.t + ATTACK_TAIL) attack = attackPose((t - start) / (ATTACK_LEAD + ATTACK_TAIL));
    } else if (t >= e.t && t < e.t + HIT_DURATION) {
      hit = hitPose((t - e.t) / HIT_DURATION, e.crit || e.mult > 1);
    }
  }
  if (hit && attack) return blend(attack, hit, 0.7);
  if (hit) return hit;
  if (attack) return attack;
  return moving ? walkPose(t) : idlePose(t);
}
