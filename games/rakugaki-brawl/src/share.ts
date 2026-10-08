import type { Color, Drawing, Stroke } from './types.js';

const COLORS: Color[] = ['black', 'red', 'green', 'blue'];
const MAGIC = 'RB1';
const MAX_STROKES = 200;
const MAX_POINTS = 4000;

/**
 * Encode a drawing as a short share code: integers packed into a compact
 * string so a doodle can be pasted into chat and fought by someone else.
 * Format: RB1.<w>x<h>.<stroke>;<stroke>... where a stroke is
 * <colorIndex>,<width>,<x1>,<y1>,<x2>,<y2>,... with coordinates rounded.
 */
export function encodeDrawing(d: Drawing): string {
  const parts = d.strokes.map((s) => {
    const ci = COLORS.indexOf(s.color);
    const coords = s.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(',');
    return `${ci},${s.width},${coords}`;
  });
  const raw = `${MAGIC}.${d.width}x${d.height}.${parts.join(';')}`;
  return base64url(raw);
}

export function decodeDrawing(code: string): Drawing {
  let raw: string;
  try { raw = fromBase64url(code.trim()); } catch { throw new Error('not a Rakugaki Brawl code'); }
  const m = /^RB1\.(\d+)x(\d+)\.(.*)$/s.exec(raw);
  if (!m) throw new Error('not a Rakugaki Brawl code');
  const width = Number(m[1]), height = Number(m[2]);
  if (!(width > 0 && width <= 4096 && height > 0 && height <= 4096)) throw new Error('bad canvas size');
  const strokes: Stroke[] = [];
  let points = 0;
  if (m[3].length > 0) {
    for (const part of m[3].split(';')) {
      const nums = part.split(',').map(Number);
      if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) throw new Error('bad stroke');
      const color = COLORS[nums[0]];
      const width = nums[1];
      if (!color || !(width >= 1 && width <= 40)) throw new Error('bad stroke header');
      const pts = [];
      for (let i = 2; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
      points += pts.length;
      strokes.push({ color, width, points: pts });
      if (strokes.length > MAX_STROKES || points > MAX_POINTS) throw new Error('drawing too large');
    }
  }
  return { strokes, width, height };
}

function base64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s: string): string {
  const body = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const b64 = body + '='.repeat((4 - (body.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
