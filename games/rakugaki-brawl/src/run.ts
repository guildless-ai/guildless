import type { PerkId } from './perks.js';

/** Run (roguelite) state: rounds, lives, picked perks and the ink budget curve. */
export interface RunState {
  round: number;
  lives: number;
  wins: number;
  seed: number;
  over: boolean;
  perks: PerkId[];
}

export const MAX_ROUNDS = 10;
export const START_LIVES = 3;

export function newRun(seed = Date.now() % 100000): RunState {
  return { round: 1, lives: START_LIVES, wins: 0, seed, over: false, perks: [] };
}

/** Ink budget grows each round so later doodles can be bigger. */
export function inkBudget(round: number, inkBonus = 0): number {
  return 6000 + (round - 1) * 1500 + inkBonus;
}

export function applyResult(run: RunState, winner: 'a' | 'b' | 'draw'): RunState {
  const next = { ...run };
  if (winner === 'a') next.wins++;
  else next.lives--;
  if (next.lives <= 0 || next.round >= MAX_ROUNDS) next.over = true;
  else next.round++;
  return next;
}
