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

  const push = (pts: Point[]) => {
    const s: Stroke = { points: pts, color, width: penWidth };
    strokes.push(s);
    spent += pathLength(pts) * penWidth;
  };
  /** Scale a shape about the center so its ink lands at `target`. */
  const fit = (pts: Point[], target: number): Point[] => {
    const ink = pathLength(pts) * penWidth;
    const k = Math.min(1, target / ink);
    return pts.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
  };
  // Base shape takes 60..85% of the budget, filler scribbles use the rest.
  const baseTarget = inkBudget * (0.6 + rand() * 0.25);

  if (archetype === 0 || archetype === 3) {
    // Blob: a wobbly circle.
    const r = 40 + rand() * 60;
    push(fit(circle(cx, cy, r, rand, 36), baseTarget));
  } else if (archetype === 1) {
    // Spiky star: many sharp corners.
    const spikes = 5 + Math.floor(rand() * 7);
    const pts: Point[] = [];
    for (let i = 0; i <= spikes * 2; i++) {
      const ang = (i / (spikes * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 90 : 35;
      pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
    }
    push(fit(pts, baseTarget));
  } else {
    // Long worm: wide reach.
    const pts: Point[] = [];
    for (let x = 40; x <= width - 40; x += 8) {
      pts.push({ x, y: cy + Math.sin(x / 30) * 25 });
    }
    push(fit(pts, baseTarget));
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
  const name = NAMES[Math.floor(rand() * NAMES.length)] + (round > 1 ? ` Lv${round}` : '');
  return { name, drawing: { strokes, width, height } };
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

function pathLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return Math.max(len, 1);
}
