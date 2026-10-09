/** Daily run: everyone who plays on the same (UTC) day gets the same seed and enemy parade. */
export function dailyKey(date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function dailySeed(key: string): number {
  // FNV-1a over the key, folded into the seed range used by newRun().
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 100000;
}

export interface DailyBest { key: string; wins: number; rounds: number; cleared: boolean }
const DAILY_KEY = 'rakugaki-brawl.daily.v1';
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function loadDailyBest(kv: KV, key: string): DailyBest | null {
  try {
    const raw = kv.getItem(DAILY_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, DailyBest>;
    const b = all[key];
    return b && typeof b.wins === 'number' ? b : null;
  } catch { return null; }
}

/** Keeps the better of the stored and new result (more wins, then more rounds). Returns the kept one. */
export function recordDaily(kv: KV, result: DailyBest): DailyBest {
  let all: Record<string, DailyBest> = {};
  try { all = JSON.parse(kv.getItem(DAILY_KEY) ?? '{}') as Record<string, DailyBest>; } catch { all = {}; }
  const prev = all[result.key];
  const better = !prev || result.wins > prev.wins || (result.wins === prev.wins && result.rounds > prev.rounds) ? result : prev;
  all[result.key] = better;
  // keep the last 60 days only
  const keys = Object.keys(all).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete all[k];
  try { kv.setItem(DAILY_KEY, JSON.stringify(all)); } catch { /* ignore */ }
  return better;
}
