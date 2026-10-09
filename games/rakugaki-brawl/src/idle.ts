import { inkBudget } from './run.js';

/**
 * Idle ("second monitor") mode: one of your doodles fights an endless parade
 * of generated enemies while you work. Pure state here; main.ts drives it.
 */
export interface IdleState {
  wave: number;
  wins: number;
  streak: number;
  bestStreak: number;
  seed: number;
}

export const IDLE_KEY = 'rakugaki-brawl.idle.v1';

export function newIdle(seed = Date.now() % 100000): IdleState {
  return { wave: 1, wins: 0, streak: 0, bestStreak: 0, seed };
}

/** Enemy budget ramps slowly so a decent doodle lasts a while, then plateaus. */
export function idleBudget(wave: number): number {
  const round = Math.min(10, 1 + Math.floor((wave - 1) / 2));
  return inkBudget(round);
}

export function afterWave(s: IdleState, winner: 'a' | 'b' | 'draw'): IdleState {
  const won = winner === 'a';
  const streak = won ? s.streak + 1 : 0;
  return { ...s, wave: s.wave + 1, wins: s.wins + (won ? 1 : 0), streak, bestStreak: Math.max(s.bestStreak, streak) };
}

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function loadIdle(kv: KV): IdleState | null {
  try {
    const raw = kv.getItem(IDLE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<IdleState>;
    if (typeof p.wave !== 'number' || typeof p.seed !== 'number') return null;
    return { wave: p.wave, wins: p.wins ?? 0, streak: p.streak ?? 0, bestStreak: p.bestStreak ?? 0, seed: p.seed };
  } catch { return null; }
}

export function saveIdle(kv: KV, s: IdleState): void {
  try { kv.setItem(IDLE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
