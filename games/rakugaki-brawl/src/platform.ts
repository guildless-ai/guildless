/**
 * Platform services behind one small interface so the game logic never
 * talks to Steam (or localStorage) directly. The local implementation keeps
 * everything in a KV store; a Steam implementation (steamworks.js in the
 * Electron main process, bridged through the preload) can replace it later
 * without touching gameplay code.
 */
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export type AchievementId =
  | 'first_win'        // win any round
  | 'clear_run'        // finish all 10 rounds
  | 'full_creature'    // fight with a doodle that has a shield, eyes, legs and arms
  | 'beat_rival'       // beat one of your own past winners
  | 'share_fight'      // fight a doodle pasted from a share code
  | 'idle_streak_5';   // 5 wins in a row in idle mode

export const ACHIEVEMENTS: Record<AchievementId, { name: string; desc: string }> = {
  first_win: { name: 'はじめての勝利', desc: 'ラウンドに勝つ' },
  clear_run: { name: '完走', desc: '10ラウンドを走り切る' },
  full_creature: { name: 'フル装備', desc: '盾・目・脚・腕のそろった絵で戦う' },
  beat_rival: { name: '過去を超える', desc: '「むかしの自分」に勝つ' },
  share_fight: { name: 'ともだちと', desc: '共有コードの絵と戦う' },
  idle_streak_5: { name: '放置の達人', desc: '放置モードで5連勝' },
};

export interface PlatformServices {
  /** Unlock once; returns true the first time so the UI can toast. */
  unlock(id: AchievementId): boolean;
  unlocked(): AchievementId[];
  /** Persistent key/value storage (cloud-synced on Steam). */
  readonly storage: KV;
}

const ACH_KEY = 'rakugaki-brawl.achievements.v1';

export class LocalPlatform implements PlatformServices {
  constructor(readonly storage: KV) {}
  unlocked(): AchievementId[] {
    try {
      const raw = this.storage.getItem(ACH_KEY);
      const arr: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x): x is AchievementId => typeof x === 'string' && x in ACHIEVEMENTS) : [];
    } catch { return []; }
  }
  unlock(id: AchievementId): boolean {
    const have = this.unlocked();
    if (have.includes(id)) return false;
    try { this.storage.setItem(ACH_KEY, JSON.stringify([...have, id])); } catch { /* storage unavailable */ }
    return true;
  }
}

/** Idle-mode rewards: every 5 idle wins banks one ink token, spent on the next run (max 3). */
const TOKEN_KEY = 'rakugaki-brawl.inktokens.v1';
export const TOKEN_EVERY = 5;
export const TOKEN_CAP = 3;

export function tokensFromWins(wins: number): number {
  return Math.floor(wins / TOKEN_EVERY);
}

export function loadTokens(kv: KV): number {
  const n = Number(kv.getItem(TOKEN_KEY) ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.min(TOKEN_CAP, Math.floor(n)) : 0;
}

export function saveTokens(kv: KV, n: number): void {
  try { kv.setItem(TOKEN_KEY, String(Math.max(0, Math.min(TOKEN_CAP, Math.floor(n))))); } catch { /* ignore */ }
}

/** Banks newly earned tokens given the previous and current idle win counts. Returns the new balance. */
export function bankIdleTokens(kv: KV, prevWins: number, wins: number): number {
  const earned = tokensFromWins(wins) - tokensFromWins(prevWins);
  const balance = Math.min(TOKEN_CAP, loadTokens(kv) + Math.max(0, earned));
  saveTokens(kv, balance);
  return balance;
}

/** Spends all banked tokens; returns how many (each is one 'ink' perk on the new run). */
export function spendTokens(kv: KV): number {
  const n = loadTokens(kv);
  saveTokens(kv, 0);
  return n;
}
