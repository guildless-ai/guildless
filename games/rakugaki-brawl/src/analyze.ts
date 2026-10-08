import type { Color, Drawing, Point, Stats, Stroke } from './types.js';

/** Ink cost of a stroke: path length times pen width. */
export function strokeInk(stroke: Stroke): number {
  let len = 0;
  for (let i = 1; i < stroke.points.length; i++) {
    len += dist(stroke.points[i - 1], stroke.points[i]);
  }
  // A single tap still costs a dot.
  return Math.max(len, 1) * stroke.width;
}

export function totalInk(drawing: Drawing): number {
  return drawing.strokes.reduce((sum, s) => sum + strokeInk(s), 0);
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Count sharp corners. A corner is a direction change of more than
 * `minAngleDeg` degrees between two consecutive segments that are each at
 * least `minSeg` long (ignores jitter).
 */
export function countSpikes(stroke: Stroke, minAngleDeg = 80, minSeg = 8): number {
  const pts = simplify(stroke.points, minSeg);
  let spikes = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const v1x = b.x - a.x, v1y = b.y - a.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    if (l1 === 0 || l2 === 0) continue;
    const cos = (v1x * v2x + v1y * v2y) / (l1 * l2);
    const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (angle >= minAngleDeg) spikes++;
  }
  return spikes;
}

/** Drop points closer than `minSeg` to the previously kept point. */
export function simplify(points: Point[], minSeg: number): Point[] {
  if (points.length === 0) return [];
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (dist(out[out.length - 1], points[i]) >= minSeg) out.push(points[i]);
  }
  return out;
}

export function boundingBox(drawing: Drawing): Stats['bbox'] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of drawing.strokes) {
    for (const p of s.points) {
      const r = s.width / 2;
      minX = Math.min(minX, p.x - r); minY = Math.min(minY, p.y - r);
      maxX = Math.max(maxX, p.x + r); maxY = Math.max(maxY, p.y + r);
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function dominantColor(drawing: Drawing): Color {
  const ink: Record<Color, number> = { black: 0, red: 0, green: 0, blue: 0 };
  for (const s of drawing.strokes) ink[s.color] += strokeInk(s);
  let best: Color = 'black';
  for (const c of Object.keys(ink) as Color[]) if (ink[c] > ink[best]) best = c;
  return best;
}

/**
 * Turn a drawing into combat stats. Deterministic and tunable: the idea is
 * that every design choice (thick vs thin, spiky vs round, wide vs tall)
 * trades one stat for another so there is no dominant doodle.
 */
export function analyze(drawing: Drawing): Stats {
  const ink = totalInk(drawing);
  const spikes = drawing.strokes.reduce((n, s) => n + countSpikes(s), 0);
  const bbox = boundingBox(drawing);
  const hp = Math.round(20 + ink / 20);
  // Bigger doodles also hit harder so late rounds do not stall on the time limit.
  const atk = Math.round(3 + spikes * 1.6 + bbox.h / 40 + ink / 400);
  // Heavier doodles swing slower. 0.6 .. 2.4 attacks per second (6000 ink = 1.65/s).
  const spd = clamp(2.4 - ink / 8000, 0.6, 2.4);
  const reach = Math.round(14 + bbox.w / 5);
  return { hp, atk, spd: round2(spd), reach, ink: Math.round(ink), spikes, element: dominantColor(drawing), bbox };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Element triangle: red > green > blue > red. black is neutral. */
export function elementMultiplier(attacker: Color, defender: Color): number {
  if (attacker === 'black' || defender === 'black' || attacker === defender) return 1;
  const beats: Record<Exclude<Color, 'black'>, Color> = { red: 'green', green: 'blue', blue: 'red' };
  if (beats[attacker] === defender) return 1.5;
  return 0.75;
}
