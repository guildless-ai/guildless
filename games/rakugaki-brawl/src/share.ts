import type { Color, Drawing, Point, Stroke } from './types.js';

const COLORS: Color[] = ['black', 'red', 'green', 'blue'];
const MAX_STROKES = 200;
const MAX_POINTS = 4000;
/** Points closer than this to the previous kept point are dropped before encoding. */
const SIMPLIFY_PX = 2.5;

/**
 * Share codes carry the whole doodle so a friend can fight it with no server.
 *
 * Current format "RB2" is binary: magic, canvas size, then per stroke the
 * colour, pen width, point count, the first point as absolute int16s and
 * every following point as zigzag-varint deltas. Jitter is simplified away
 * first. Typically a third the length of the old text format.
 *
 * "RB1" (text, comma separated) is still decoded for old links.
 */
export function encodeDrawing(d: Drawing): string {
  const out: number[] = [0x52, 0x42, 2]; // "RB" 2
  pushU16(out, d.width); pushU16(out, d.height);
  const strokes = d.strokes.slice(0, MAX_STROKES);
  out.push(strokes.length);
  for (const s of strokes) {
    const pts = thin(s.points);
    out.push(COLORS.indexOf(s.color), Math.max(1, Math.min(40, Math.round(s.width))));
    pushU16(out, pts.length);
    let px = 0, py = 0;
    pts.forEach((p, i) => {
      const x = Math.round(p.x), y = Math.round(p.y);
      if (i === 0) { pushI16(out, x); pushI16(out, y); }
      else { pushVarint(out, zigzag(x - px)); pushVarint(out, zigzag(y - py)); }
      px = x; py = y;
    });
  }
  return bytesToBase64url(Uint8Array.from(out));
}

export function decodeDrawing(code: string): Drawing {
  let bytes: Uint8Array;
  try { bytes = base64urlToBytes(code.trim()); } catch { throw new Error('not a Rakugaki Brawl code'); }
  if (bytes.length >= 3 && bytes[0] === 0x52 && bytes[1] === 0x42 && bytes[2] === 2) return decodeV2(bytes);
  return decodeV1(new TextDecoder().decode(bytes));
}

function decodeV2(b: Uint8Array): Drawing {
  let i = 3;
  const need = (n: number) => { if (i + n > b.length) throw new Error('truncated code'); };
  const u16 = () => { need(2); const v = b[i] | (b[i + 1] << 8); i += 2; return v; };
  const i16 = () => { const v = u16(); return v >= 0x8000 ? v - 0x10000 : v; };
  const varint = () => {
    let v = 0, shift = 0;
    for (;;) { need(1); const byte = b[i++]; v |= (byte & 0x7f) << shift; if (!(byte & 0x80)) return v; shift += 7; if (shift > 28) throw new Error('bad varint'); }
  };
  const width = u16(), height = u16();
  if (!(width > 0 && width <= 4096 && height > 0 && height <= 4096)) throw new Error('bad canvas size');
  need(1); const count = b[i++];
  if (count > MAX_STROKES) throw new Error('drawing too large');
  const strokes: Stroke[] = [];
  let total = 0;
  for (let s = 0; s < count; s++) {
    need(2); const color = COLORS[b[i++]]; const w = b[i++];
    if (!color || !(w >= 1 && w <= 40)) throw new Error('bad stroke header');
    const n = u16();
    total += n;
    if (total > MAX_POINTS) throw new Error('drawing too large');
    const points: Point[] = [];
    let x = 0, y = 0;
    for (let k = 0; k < n; k++) {
      if (k === 0) { x = i16(); y = i16(); } else { x += unzigzag(varint()); y += unzigzag(varint()); }
      points.push({ x, y });
    }
    strokes.push({ color, width: w, points });
  }
  return { strokes, width, height };
}

function decodeV1(raw: string): Drawing {
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

/** Keep the first and last point, drop points closer than SIMPLIFY_PX to the last kept one. */
function thin(points: Point[]): Point[] {
  if (points.length <= 2) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= SIMPLIFY_PX) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

const zigzag = (n: number) => (n << 1) ^ (n >> 31);
const unzigzag = (n: number) => (n >>> 1) ^ -(n & 1);
function pushU16(out: number[], v: number): void { out.push(v & 0xff, (v >> 8) & 0xff); }
function pushI16(out: number[], v: number): void { pushU16(out, Math.max(-32768, Math.min(32767, v)) & 0xffff); }
function pushVarint(out: number[], v: number): void {
  let n = v >>> 0;
  while (n >= 0x80) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
  out.push(n);
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(s: string): Uint8Array {
  const body = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(body)) throw new Error('bad base64');
  const b64 = body + '='.repeat((4 - (body.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
