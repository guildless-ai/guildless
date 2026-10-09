/**
 * Rank ("インク縛り"): the player's difficulty ladder. Higher rank means less
 * ink for you and more for the enemy. Clearing rank r unlocks r+1.
 */
export const MAX_RANK = 10;
const RANK_KEY = 'rakugaki-brawl.rank.v1';
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function playerInkScale(rank: number): number { return Math.max(0.5, 1 - 0.04 * rank); }
export function enemyInkScale(rank: number): number { return 1 + 0.08 * rank; }

export interface RankProgress { bestCleared: number } // -1 when nothing cleared yet

export function loadRank(kv: KV): RankProgress {
  const n = Number(kv.getItem(RANK_KEY));
  return { bestCleared: Number.isFinite(n) && kv.getItem(RANK_KEY) !== null ? Math.max(-1, Math.min(MAX_RANK, Math.floor(n))) : -1 };
}

export function unlockedRank(p: RankProgress): number { return Math.min(MAX_RANK, p.bestCleared + 1); }

/** Call when a run at `rank` is cleared; returns the updated progress. */
export function recordClear(kv: KV, rank: number): RankProgress {
  const p = loadRank(kv);
  const next = { bestCleared: Math.max(p.bestCleared, Math.min(MAX_RANK, rank)) };
  try { kv.setItem(RANK_KEY, String(next.bestCleared)); } catch { /* ignore */ }
  return next;
}
