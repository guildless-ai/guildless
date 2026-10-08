import { mulberry32 } from './rng.js';
import type { Drawing, Stroke } from './types.js';

export const CSS: Record<Stroke['color'], string> = {
  black: '#222222',
  red: '#e4572e',
  green: '#3a9d5d',
  blue: '#2e6fe4',
};

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  if (s.points.length === 0) return;
  ctx.strokeStyle = CSS[s.color];
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s.points[0].x, s.points[0].y);
  for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
  if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y);
  ctx.stroke();
}

export function drawDrawing(ctx: CanvasRenderingContext2D, d: Drawing): void {
  for (const s of d.strokes) drawStroke(ctx, s);
}

/** Render a drawing cropped to its bounding box as a sprite canvas. */
export function toSprite(d: Drawing, bbox: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(bbox.w));
  c.height = Math.max(1, Math.ceil(bbox.h));
  const ctx = c.getContext('2d')!;
  ctx.translate(-bbox.x, -bbox.y);
  drawDrawing(ctx, d);
  return c;
}

/**
 * Hand-drawn "boil": a few copies of the sprite with every point nudged by
 * up to `jitter` px. Cycling them at ~8 fps makes a static doodle look alive.
 */
export function toSpriteVariants(d: Drawing, bbox: { x: number; y: number; w: number; h: number }, count = 3, jitter = 1.3, seed = 7): HTMLCanvasElement[] {
  const rand = mulberry32(seed);
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < count; i++) {
    const jittered: Drawing = {
      ...d,
      strokes: d.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ x: p.x + (rand() - 0.5) * 2 * jitter, y: p.y + (rand() - 0.5) * 2 * jitter })) })),
    };
    out.push(toSprite(jittered, { x: bbox.x - jitter, y: bbox.y - jitter, w: bbox.w + jitter * 2, h: bbox.h + jitter * 2 }));
  }
  return out;
}
