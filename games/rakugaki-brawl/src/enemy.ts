import { analyze } from './analyze.js';
import { mulberry32 } from './rng.js';
import type { Color, Drawing, Point, Stroke } from './types.js';

const COLORS: Color[] = ['black', 'red', 'green', 'blue'];
const NAMES = ['まるいの', 'トゲトゲ', 'ながいの', 'ぐるぐる', 'ギザギザ', 'ふとっちょ', 'ひょろり', 'ばくだん'];

/**
 * Procedurally doodle an enemy with roughly `inkBudget` ink so the player
 * fights things built from the same rules they are.
 */
export function generateEnemy(round: number, inkBudget: number, seed: number): { name: string; drawing: Drawing } {
  const rand = mulberry32(seed * 7919 + round);
  const width = 480, height = 360;
  const cx = width / 2, cy = height / 2;
  const archetype = Math.floor(rand() * 4);
  const color = COLORS[Math.floor(rand() * COLORS.length)];
  const strokes: Stroke[] = [];
  let spent = 0;
  const penWidth = archetype === 3 ? 14 : archetype === 1 ? 4 : 8;

  const push = (pts: Point[], w = penWidth) => {
    const s: Stroke = { points: pts, color, width: w };
    strokes.push(s);
    spent += pathLength(pts) * w;
  };
  /** Add a thin feature stroke only if the budget still covers it. */
  const feature = (pts: Point[]): boolean => {
    const cost = pathLength(pts) * 4;
    if (inkBudget - spent < cost) return false;
    push(pts, 4);
    return true;
  };
  /** Scale a shape about the center so its ink lands at `target`. */
  const fit = (pts: Point[], target: number): Point[] => {
    const ink = pathLength(pts) * penWidth;
    const k = Math.min(1, target / ink);
    return pts.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
  };
  // Base shape takes 60..85% of the budget, filler scribbles use the rest.
  const baseTarget = inkBudget * (0.6 + rand() * 0.25);

  let base: Point[];
  if (archetype === 0 || archetype === 3) {
    // Blob: a wobbly circle.
    const r = 40 + rand() * 60;
    base = fit(circle(cx, cy, r, rand, 36), baseTarget);
    push(base);
  } else if (archetype === 1) {
    // Spiky star: many sharp corners.
    // Early rounds get gentler stars; later rounds up to 10 spikes.
    const spikes = 3 + Math.floor(rand() * Math.min(8, 2 + round));
    const pts: Point[] = [];
    for (let i = 0; i <= spikes * 2; i++) {
      const ang = (i / (spikes * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 90 : 35;
      pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
    }
    base = fit(pts, baseTarget);
    push(base);
  } else {
    // Long worm: wide reach.
    const pts: Point[] = [];
    for (let x = 40; x <= width - 40; x += 8) {
      pts.push({ x, y: cy + Math.sin(x / 30) * 25 });
    }
    base = fit(pts, baseTarget);
    push(base);
  }

  // Features read by parts.ts/traits: eyes (crit), legs (speed), arms (attack).
  // They use the same rules as the player's drawing, so the enemy's tags are honest.
  const bb = bbox(base);
  const bottom = bb.y + bb.h, right = bb.x + bb.w, left = bb.x;
  const wantEyes = archetype !== 2 && rand() < 0.65;
  if (wantEyes) {
    const ex = Math.max(12, bb.w * 0.15), ey = cy - Math.max(8, bb.h * 0.18);
    feature(circle(cx - ex, ey, 5, rand, 12)) && feature(circle(cx + ex, ey, 5, rand, 12));
  }
  const legCount = archetype === 2 ? 2 + 2 * Math.floor(rand() * 3) : rand() < 0.7 ? 2 : 0;
  for (let i = 0; i < legCount; i++) {
    const fx = left + bb.w * ((i + 1) / (legCount + 1));
    const len = 40 + rand() * 25;
    feature([{ x: fx, y: bottom - 2 }, { x: fx + (rand() - 0.5) * 16, y: bottom + len }]);
  }
  const armCount = archetype === 1 ? 0 : rand() < 0.5 ? 1 + Math.floor(rand() * 2) : 0;
  for (let i = 0; i < armCount; i++) {
    const dir = i === 0 ? 1 : -1;
    const sx = dir === 1 ? right - 2 : left + 2;
    const len = 45 + rand() * 25;
    feature([{ x: sx, y: cy - 10 }, { x: sx + dir * len, y: cy - 10 - rand() * 40 }]);
  }

  // Spend remaining ink on filler scribbles.
  let guard = 0;
  while (inkBudget - spent > 40 && guard++ < 20) {
    // Circle ink is about 2*pi*r*penWidth; cap r so the scribble fits.
    const maxR = (inkBudget - spent) / (2 * Math.PI * penWidth * 1.1);
    const r = Math.min(10 + rand() * 25, maxR);
    if (r < 3) break;
    const ox = cx + (rand() - 0.5) * 160, oy = cy + (rand() - 0.5) * 120;
    push(circle(ox, oy, r, rand, 12));
  }
  // Name the enemy from what the player's own analysis will see, so the
  // prefix never promises a trait the tags do not show.
  const drawing: Drawing = { strokes, width, height };
  const tr = analyze(drawing).traits;
  const tags: string[] = [];
  if (tr.eyes > 0) tags.push('めだま');
  if (tr.legs >= 4) tags.push('むかで'); else if (tr.legs > 0) tags.push('あしつき');
  if (tr.arms > 0) tags.push('うでつき');
  const prefix = tags.length ? tags[Math.floor(rand() * tags.length)] : '';
  const name = prefix + NAMES[Math.floor(rand() * NAMES.length)] + (round > 1 ? ` Lv${round}` : '');
  return { name, drawing };
}

function circle(cx: number, cy: number, r: number, rand: () => number, n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const rr = r * (0.97 + rand() * 0.06);
    pts.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr });
  }
  return pts;
}

function bbox(pts: Point[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function pathLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return Math.max(len, 1);
}
