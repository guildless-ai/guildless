import { analyze, elementMultiplier } from './analyze.js';
import { mulberry32 } from './rng.js';
import type { Drawing, Stats } from './types.js';

export interface Fighter {
  name: string;
  drawing: Drawing;
  stats: Stats;
  hp: number;
  x: number;
  /** Seconds until the next attack is allowed. */
  cooldown: number;
}

export type BattleEvent =
  | { t: number; kind: 'hit'; from: 'a' | 'b'; dmg: number; crit: boolean; mult: number }
  | { t: number; kind: 'end'; winner: 'a' | 'b' | 'draw' };

export interface BattleResult {
  winner: 'a' | 'b' | 'draw';
  events: BattleEvent[];
  duration: number;
}

export const ARENA_W = 480;
const WALK_SPEED = 90; // px per second
const TIME_LIMIT = 45; // seconds
const DT = 1 / 60;

export function makeFighter(name: string, drawing: Drawing, x: number): Fighter {
  const stats = analyze(drawing);
  return { name, drawing, stats, hp: stats.hp, x, cooldown: 0.3 };
}

/**
 * Deterministic step-based simulation. Both fighters walk toward each other,
 * then attack when the opponent is within reach. Returns the full event log so
 * the renderer can replay it and tests can assert on it.
 */
export function simulate(a: Fighter, b: Fighter, seed = 1): BattleResult {
  const rand = mulberry32(seed);
  const events: BattleEvent[] = [];
  let t = 0;
  while (t < TIME_LIMIT) {
    const gap = b.x - a.x;
    if (gap > a.stats.reach && gap > b.stats.reach) {
      a.x += WALK_SPEED * DT;
      b.x -= WALK_SPEED * DT;
    } else {
      if (gap > a.stats.reach) a.x += WALK_SPEED * DT;
      if (gap > b.stats.reach) b.x -= WALK_SPEED * DT;
    }
    a.cooldown -= DT;
    b.cooldown -= DT;
    if (a.cooldown <= 0 && b.x - a.x <= a.stats.reach) {
      events.push(attack(a, b, 'a', t, rand));
      a.cooldown = 1 / a.stats.spd;
    }
    if (b.hp > 0 && b.cooldown <= 0 && b.x - a.x <= b.stats.reach) {
      events.push(attack(b, a, 'b', t, rand));
      b.cooldown = 1 / b.stats.spd;
    }
    if (a.hp <= 0 || b.hp <= 0) break;
    t += DT;
  }
  let winner: BattleResult['winner'];
  if (a.hp <= 0 && b.hp <= 0) winner = 'draw';
  else if (b.hp <= 0) winner = 'a';
  else if (a.hp <= 0) winner = 'b';
  else winner = a.hp / a.stats.hp >= b.hp / b.stats.hp ? 'a' : 'b';
  events.push({ t, kind: 'end', winner });
  return { winner, events, duration: t };
}

function attack(from: Fighter, to: Fighter, who: 'a' | 'b', t: number, rand: () => number): BattleEvent {
  const mult = elementMultiplier(from.stats.element, to.stats.element);
  const crit = rand() < 0.1;
  const variance = 0.85 + rand() * 0.3;
  const dmg = Math.max(1, Math.round(from.stats.atk * mult * variance * (crit ? 2 : 1)));
  to.hp = Math.max(0, to.hp - dmg);
  return { t, kind: 'hit', from: who, dmg, crit, mult };
}
