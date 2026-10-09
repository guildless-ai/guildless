/** Run-level upgrades picked between rounds. Each is a multiplicative or additive tweak. */
export type PerkId = 'ink' | 'atk' | 'hp' | 'spd' | 'crit' | 'reach';

export interface Perk {
  id: PerkId;
  name: string;
  desc: string;
}

export const PERKS: Record<PerkId, Perk> = {
  ink: { id: 'ink', name: 'インク壺', desc: 'インク上限 +900' },
  atk: { id: 'atk', name: 'とがった鉛筆', desc: '攻撃 +20%' },
  hp: { id: 'hp', name: '厚紙', desc: 'HP +20%' },
  spd: { id: 'spd', name: '速描き', desc: '速さ +15%' },
  crit: { id: 'crit', name: '一発芸', desc: 'クリティカル率 +10%' },
  reach: { id: 'reach', name: '長い腕', desc: 'リーチ +15' },
};

export interface Modifiers {
  inkBonus: number;
  atkMul: number;
  hpMul: number;
  spdMul: number;
  critChance: number;
  reachBonus: number;
}

export const BASE_MODIFIERS: Modifiers = { inkBonus: 0, atkMul: 1, hpMul: 1, spdMul: 1, critChance: 0.1, reachBonus: 0 };

export function applyPerks(perks: PerkId[]): Modifiers {
  const m = { ...BASE_MODIFIERS };
  for (const p of perks) {
    if (p === 'ink') m.inkBonus += 900;
    else if (p === 'atk') m.atkMul *= 1.2;
    else if (p === 'hp') m.hpMul *= 1.2;
    else if (p === 'spd') m.spdMul *= 1.15;
    else if (p === 'crit') m.critChance = Math.min(0.6, m.critChance + 0.1);
    else if (p === 'reach') m.reachBonus += 15;
  }
  return m;
}

/** Offer three distinct perks, deterministic for a given rand. */
export function offerPerks(rand: () => number, count = 3): Perk[] {
  const ids = Object.keys(PERKS) as PerkId[];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count).map((id) => PERKS[id]);
}
