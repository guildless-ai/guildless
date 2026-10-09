import { analyze, elementMultiplier } from './analyze.js';
import { BASE_MODIFIERS, type Modifiers } from './perks.js';
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
  critChance: number;
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
/** Damage scale: fights last ~8-12 s so there is time to draw on your fighter mid-battle. */
const DMG_SCALE = 0.55;

export function makeFighter(name: string, drawing: Drawing, x: number, mods: Modifiers = BASE_MODIFIERS): Fighter {
  const base = analyze(drawing);
  const stats: Stats = {
    ...base,
    hp: Math.round(base.hp * mods.hpMul),
    atk: Math.round(base.atk * mods.atkMul),
    spd: Math.round(base.spd * mods.spdMul * 100) / 100,
    reach: base.reach + mods.reachBonus,
  };
  return { name, drawing, stats, hp: stats.hp, x, cooldown: 0.3, critChance: mods.critChance };
}

/** Recompute a fighter's stats after its drawing changed mid-battle. Max HP growth heals by the same amount. */
export function refreshFighter(f: Fighter, mods: Modifiers = BASE_MODIFIERS): { hpGain: number } {
  const base = analyze(f.drawing);
  const next: Stats = {
    ...base,
    hp: Math.round(base.hp * mods.hpMul),
    atk: Math.round(base.atk * mods.atkMul),
    spd: Math.round(base.spd * mods.spdMul * 100) / 100,
    reach: base.reach + mods.reachBonus,
  };
  const hpGain = Math.max(0, next.hp - f.stats.hp);
  f.stats = next;
  f.hp = Math.min(next.hp, f.hp + hpGain);
  return { hpGain };
}

/**
 * Step-based simulation that can be advanced in real time, so the fighters'
 * drawings (and therefore stats) may change while the battle runs. Both
 * fighters walk toward each other, then attack when the opponent is within reach.
 */
export class LiveBattle {
  t = 0;
  finished = false;
  winner: BattleResult['winner'] | null = null;
  readonly events: BattleEvent[] = [];
  private rand: () => number;
  private acc = 0;
  constructor(readonly a: Fighter, readonly b: Fighter, seed = 1) {
    this.rand = mulberry32(seed);
  }

  /** Advance by `dt` seconds (in fixed DT sub-steps) and return the events produced. */
  step(dt: number): BattleEvent[] {
    const out: BattleEvent[] = [];
    if (this.finished) return out;
    this.acc += dt;
    while (this.acc >= DT - 1e-9 && !this.finished) {
      this.acc -= DT;
      this.tick(out);
    }
    return out;
  }

  private tick(out: BattleEvent[]): void {
    const { a, b } = this;
    if (this.t >= TIME_LIMIT) { this.end(out); return; }
    const gap = b.x - a.x;
    if (gap > a.stats.reach) a.x += WALK_SPEED * DT;
    if (gap > b.stats.reach) b.x -= WALK_SPEED * DT;
    a.cooldown -= DT;
    b.cooldown -= DT;
    if (a.cooldown <= 0 && b.x - a.x <= a.stats.reach) {
      out.push(this.push(attack(a, b, 'a', this.t, this.rand)));
      a.cooldown = 1 / a.stats.spd;
    }
    if (b.hp > 0 && b.cooldown <= 0 && b.x - a.x <= b.stats.reach) {
      out.push(this.push(attack(b, a, 'b', this.t, this.rand)));
      b.cooldown = 1 / b.stats.spd;
    }
    if (a.hp <= 0 || b.hp <= 0) { this.end(out); return; }
    this.t += DT;
  }

  private end(out: BattleEvent[]): void {
    const { a, b } = this;
    let winner: BattleResult['winner'];
    if (a.hp <= 0 && b.hp <= 0) winner = 'draw';
    else if (b.hp <= 0) winner = 'a';
    else if (a.hp <= 0) winner = 'b';
    else winner = a.hp / a.stats.hp >= b.hp / b.stats.hp ? 'a' : 'b';
    this.winner = winner;
    this.finished = true;
    out.push(this.push({ t: this.t, kind: 'end', winner }));
  }

  private push(ev: BattleEvent): BattleEvent { this.events.push(ev); return ev; }
}

/**
 * Deterministic whole-battle simulation (LiveBattle run to the end). Returns
 * the full event log so tests can assert on it and the result card can use it.
 */
export function simulate(a: Fighter, b: Fighter, seed = 1): BattleResult {
  const live = new LiveBattle(a, b, seed);
  while (!live.finished) live.step(1);
  return { winner: live.winner!, events: live.events, duration: live.t };
}

function attack(from: Fighter, to: Fighter, who: 'a' | 'b', t: number, rand: () => number): BattleEvent {
  const mult = elementMultiplier(from.stats.element, to.stats.element);
  const crit = rand() < from.critChance + from.stats.critBonus;
  const variance = 0.85 + rand() * 0.3;
  const raw = Math.round(from.stats.atk * DMG_SCALE * mult * variance * (crit ? 2 : 1));
  const dmg = Math.max(1, raw - to.stats.armor);
  to.hp = Math.max(0, to.hp - dmg);
  return { t, kind: 'hit', from: who, dmg, crit, mult };
}
