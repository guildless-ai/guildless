import { decodeDrawing, encodeDrawing } from './share.js';
import type { Drawing } from './types.js';

/** A doodle that won a round, kept so it can come back as an enemy. */
export interface GalleryEntry {
  code: string;
  round: number;
  savedAt: number;
}

export const GALLERY_KEY = 'rakugaki-brawl.gallery.v1';
export const GALLERY_MAX = 30;

/** Minimal storage shape so tests can pass a plain object. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadGallery(kv: KV): GalleryEntry[] {
  try {
    const raw = kv.getItem(GALLERY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

export function saveWinner(kv: KV, drawing: Drawing, round: number, now = Date.now()): GalleryEntry[] {
  const entries = loadGallery(kv);
  entries.push({ code: encodeDrawing(drawing), round, savedAt: now });
  const trimmed = entries.slice(-GALLERY_MAX);
  try { kv.setItem(GALLERY_KEY, JSON.stringify(trimmed)); } catch { /* storage may be unavailable */ }
  return trimmed;
}

/**
 * Pick a past winner close to the current round as a "rival" enemy.
 * Returns null when the gallery is empty or has no entry within 2 rounds.
 */
export function pickRival(entries: GalleryEntry[], round: number, rand: () => number): { drawing: Drawing; entry: GalleryEntry } | null {
  const near = entries.filter((e) => Math.abs(e.round - round) <= 2);
  if (near.length === 0) return null;
  const entry = near[Math.floor(rand() * near.length)];
  try {
    return { drawing: decodeDrawing(entry.code), entry };
  } catch {
    return null;
  }
}

function isEntry(v: unknown): v is GalleryEntry {
  return typeof v === 'object' && v !== null
    && typeof (v as GalleryEntry).code === 'string'
    && typeof (v as GalleryEntry).round === 'number'
    && typeof (v as GalleryEntry).savedAt === 'number';
}
