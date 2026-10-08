import { strokeInk } from './analyze.js';
import type { Drawing, Point, Stroke } from './types.js';

export interface BBox { x: number; y: number; w: number; h: number }

export interface Limb {
  /** Index into drawing.strokes. */
  stroke: number;
  /** Rotation pivot in drawing space (where the limb meets the body). */
  pivot: Point;
  kind: 'leg' | 'arm';
  /** +1 = on the facing side (right in drawing space), -1 = behind. */
  side: 1 | -1;
}

export interface Parts {
  body: BBox;
  legs: Limb[];
  arms: Limb[];
}

/** Per-limb swing angles in radians, positive = swing toward the facing side. */
export interface LimbPose {
  legs: number[];
  arms: number[];
}

export const MAX_LEGS = 6;
export const MAX_ARMS = 4;

export function strokeBBox(s: Stroke): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of s.points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function union(a: BBox, b: BBox): BBox {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function distToBox(p: Point, b: BBox): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

function nearestToBox(s: Stroke, b: BBox): Point {
  let best = s.points[0], bd = Infinity;
  for (const p of s.points) {
    const d = distToBox(p, b);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/**
 * Split a doodle into a body and limbs using only geometry:
 * - body: the heaviest stroke plus every stroke whose centre sits inside it
 *   or that carries at least 35% of the heaviest stroke's ink;
 * - leg: a non-body stroke that hangs below the body, is taller than wide
 *   and starts near the body;
 * - arm: a non-body stroke that sticks out sideways past the body.
 * Everything else (eyes, spikes on top) stays attached to the body.
 */
export function segmentParts(d: Drawing): Parts {
  const empty: Parts = { body: { x: 0, y: 0, w: 0, h: 0 }, legs: [], arms: [] };
  if (d.strokes.length === 0) return empty;
  const inks = d.strokes.map(strokeInk);
  const boxes = d.strokes.map(strokeBBox);
  const heavy = inks.indexOf(Math.max(...inks));
  const bodyIdx = new Set<number>([heavy]);
  const heavyBox = boxes[heavy];
  d.strokes.forEach((_, i) => {
    if (i === heavy) return;
    const b = boxes[i];
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const inside = cx >= heavyBox.x && cx <= heavyBox.x + heavyBox.w && cy >= heavyBox.y && cy <= heavyBox.y + heavyBox.h;
    if (inside || inks[i] >= inks[heavy] * 0.35) bodyIdx.add(i);
  });
  let body = heavyBox;
  for (const i of bodyIdx) body = union(body, boxes[i]);
  const bodyCx = body.x + body.w / 2;
  const legs: Limb[] = [], arms: Limb[] = [];
  d.strokes.forEach((s, i) => {
    if (bodyIdx.has(i) || s.points.length < 2) return;
    const b = boxes[i];
    const bottom = b.y + b.h;
    // Margins scale with the body but never collapse to zero for flat bodies (a single line).
    const hangsBelow = bottom > body.y + body.h + Math.max(6, body.h * 0.1);
    const attachedNear = b.y <= body.y + body.h + Math.max(12, body.h * 0.15);
    const tallish = b.h >= b.w * 0.6;
    const cx = b.x + b.w / 2;
    const side: 1 | -1 = cx >= bodyCx ? 1 : -1;
    if (hangsBelow && attachedNear && tallish && legs.length < MAX_LEGS) {
      // Pivot where the leg meets the body: its highest point.
      const top = s.points.reduce((a, p) => (p.y < a.y ? p : a), s.points[0]);
      legs.push({ stroke: i, pivot: top, kind: 'leg', side });
      return;
    }
    // Must poke out past the body by a fifth of its width, but never more than 30px
    // so wide bodies (worms) can still have arms.
    const out = Math.min(30, body.w * 0.2);
    const sticksOut = b.x < body.x - out || b.x + b.w > body.x + body.w + out;
    if (sticksOut && arms.length < MAX_ARMS) {
      arms.push({ stroke: i, pivot: nearestToBox(s, body), kind: 'arm', side });
    }
  });
  return { body, legs, arms };
}

function rotateAround(p: Point, pivot: Point, angle: number): Point {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = p.x - pivot.x, dy = p.y - pivot.y;
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
}

/** Apply limb angles to a drawing, rotating each limb stroke about its pivot. */
export function posedDrawing(d: Drawing, parts: Parts, pose: LimbPose): Drawing {
  const angleOf = new Map<number, number>();
  parts.legs.forEach((l, i) => angleOf.set(l.stroke, pose.legs[i] ?? 0));
  parts.arms.forEach((l, i) => angleOf.set(l.stroke, pose.arms[i] ?? 0));
  if (angleOf.size === 0) return d;
  const pivotOf = new Map<number, Point>();
  for (const l of [...parts.legs, ...parts.arms]) pivotOf.set(l.stroke, l.pivot);
  return {
    ...d,
    strokes: d.strokes.map((s, i) => {
      const a = angleOf.get(i);
      if (!a) return s;
      const pivot = pivotOf.get(i)!;
      // Canvas y grows downward, so a positive (toward-facing) swing of a leg
      // hanging below the pivot is a negative rotation in screen space.
      return { ...s, points: s.points.map((p) => rotateAround(p, pivot, -a)) };
    }),
  };
}

/** Legible bonuses read off the doodle's shapes; shown to the player as tags. */
export interface Traits {
  /** Closed loops that are not eyes (the body ring counts). Each adds armour. */
  loops: number;
  /** Small closed loops inside the body: up to 2 count as eyes. */
  eyes: number;
  legs: number;
  arms: number;
}

export function isClosedLoop(s: Stroke): boolean {
  if (s.points.length < 6) return false;
  const a = s.points[0], b = s.points[s.points.length - 1];
  const bb = strokeBBox(s);
  if (bb.w < 8 || bb.h < 8) return false;
  const gap = Math.hypot(a.x - b.x, a.y - b.y);
  return gap <= Math.max(14, s.width * 2, Math.min(bb.w, bb.h) * 0.25);
}

export function traits(d: Drawing, parts: Parts): Traits {
  let loops = 0, eyes = 0;
  const body = parts.body;
  d.strokes.forEach((s) => {
    if (!isClosedLoop(s)) return;
    const bb = strokeBBox(s);
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    const inside = cx > body.x && cx < body.x + body.w && cy > body.y && cy < body.y + body.h;
    const small = bb.w <= body.w * 0.35 && bb.h <= body.h * 0.35 && (bb.w < body.w || bb.h < body.h);
    if (inside && small && eyes < 2) eyes++;
    else loops++;
  });
  return { loops, eyes, legs: parts.legs.length, arms: parts.arms.length };
}
