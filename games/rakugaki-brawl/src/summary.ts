import { analyze } from './analyze.js';
import { drawDrawing } from './render.js';
import type { RunState } from './run.js';
import type { Drawing } from './types.js';

/** One round of a run, kept for the end-of-run card. */
export interface RoundRecord {
  round: number;
  drawing: Drawing;
  enemyName: string;
  result: 'win' | 'lose' | 'draw';
}

export const CARD_W = 1200;
export const CARD_H = 630; // social-card aspect

export interface CardLayout {
  cols: number;
  rows: number;
  cell: number;
  originX: number;
  originY: number;
}

/** Grid for up to 10 thumbnails under the title band; pure so it can be tested. */
export function cardLayout(count: number, w = CARD_W, h = CARD_H): CardLayout {
  const n = Math.max(1, Math.min(10, count));
  const cols = n <= 5 ? n : 5;
  const rows = n <= 5 ? 1 : 2;
  const areaTop = 150, areaH = h - areaTop - 60;
  const cell = Math.floor(Math.min((w - 80) / cols, areaH / rows));
  const originX = Math.floor((w - cell * cols) / 2);
  const originY = areaTop + Math.floor((areaH - cell * rows) / 2);
  return { cols, rows, cell, originX, originY };
}

export function cardTitle(run: RunState, history: RoundRecord[]): string {
  const wins = history.filter((r) => r.result === 'win').length;
  return run.lives > 0 && history.length >= 10 ? `完走！ ${wins}勝` : `${history.length}ラウンド ${wins}勝で力尽きた`;
}

/**
 * Render the shareable result card: title, per-round doodle thumbnails with
 * a win/lose mark and the enemy's name. Returns the canvas.
 */
export function renderSummaryCard(run: RunState, history: RoundRecord[], canvas: HTMLCanvasElement): HTMLCanvasElement {
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f7f3e8'; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = '#222';
  ctx.font = 'bold 56px system-ui, "Hiragino Sans", sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(cardTitle(run, history), 40, 36);
  ctx.font = '26px system-ui, "Hiragino Sans", sans-serif';
  ctx.fillStyle = '#8a8378';
  ctx.fillText(`らくがきブロウル ・ 強化 ${run.perks.length} ・ seed ${run.seed}`, 42, 104);

  const L = cardLayout(history.length);
  history.slice(0, 10).forEach((rec, i) => {
    const col = i % L.cols, row = Math.floor(i / L.cols);
    const x = L.originX + col * L.cell, y = L.originY + row * L.cell;
    // Card background
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = rec.result === 'win' ? '#3a9d5d' : rec.result === 'lose' ? '#e4572e' : '#8a8378';
    ctx.lineWidth = 4;
    roundRect(ctx, x + 8, y + 8, L.cell - 16, L.cell - 16, 14);
    ctx.fill(); ctx.stroke();
    // Doodle thumbnail, fitted into the upper part of the cell
    const bbox = analyze(rec.drawing).bbox;
    const pad = 22, avail = L.cell - pad * 2 - 44;
    const scale = Math.min(avail / Math.max(1, bbox.w), avail / Math.max(1, bbox.h), 1);
    ctx.save();
    ctx.translate(x + L.cell / 2 - (bbox.w * scale) / 2, y + pad + (avail - bbox.h * scale) / 2);
    ctx.scale(scale, scale);
    ctx.translate(-bbox.x, -bbox.y);
    drawDrawing(ctx, rec.drawing);
    ctx.restore();
    // Result mark and enemy
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(rec.result === 'win' ? '○' : rec.result === 'lose' ? '×' : '△', x + 18, y + 14);
    ctx.fillStyle = '#222';
    ctx.font = '16px system-ui, "Hiragino Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`R${rec.round} vs ${rec.enemyName}`.slice(0, 22), x + L.cell / 2, y + L.cell - 38, L.cell - 24);
  });
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8a8378';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('#らくがきブロウル', CARD_W - 40, CARD_H - 40);
  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
