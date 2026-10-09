import type { Phase, Pose } from './anim.js';
import { IDLE } from './anim.js';
import type { ArenaRenderer, FighterView, ReplayState } from './view.js';

const IDLE_PHASE: Phase = { kind: 'idle', u: 0, big: false };

/** Flat canvas renderer, used when WebGL is unavailable. Same poses as Arena3D. */
export class Arena2D implements ArenaRenderer {
  private ctx: CanvasRenderingContext2D;
  private a: FighterView | null = null;
  private b: FighterView | null = null;
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }
  setFighters(a: FighterView, b: FighterView): void { this.a = a; this.b = b; }
  resize(): void { /* draws from canvas size every frame */ }
  preview(b: FighterView, xB: number): void {
    this.a = null; this.b = b;
    this.draw({ t: 0, xA: -999, xB, poseA: IDLE, poseB: IDLE, phaseA: IDLE_PHASE, phaseB: IDLE_PHASE, hpA: 1, hpB: 1, hpA0: 1, hpB0: 1, popups: [], shake: 0, flashA: false, flashB: false });
  }
  draw(s: ReplayState): void {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Logical arena is 480 wide; scale to whatever resolution the canvas has.
    const k = canvas.width / 480;
    ctx.scale(k, k);
    if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake * 2, (Math.random() - 0.5) * s.shake * 2);
    ctx.fillStyle = '#f1ede2';
    ctx.fillRect(0, 220, canvas.width / k, Math.max(0, canvas.height / k - 220));
    if (this.a) this.blit(this.a, s.xA, 220, 1, s.poseA, s.phaseA, s.t, s.flashA);
    if (this.b) this.blit(this.b, s.xB, 220, -1, s.poseB, s.phaseB, s.t, s.flashB);
    for (const p of s.popups) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color; ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center'; ctx.fillText(p.text, p.x, 110 - (1 - p.life) * 40);
      ctx.globalAlpha = 1;
    }
  }
  private blit(v: FighterView, x: number, groundY: number, dir: 1 | -1, pose: Pose, phase: Phase, t: number, flash: boolean): void {
    const sprite = v.frame(t, phase);
    const maxH = 180, maxW = 260;
    const scale = Math.min(1, maxH / sprite.height, maxW / sprite.width);
    const w = sprite.width * scale, h = sprite.height * scale;
    const { ctx } = this;
    ctx.save();
    ctx.translate(x + pose.dx * dir, groundY + pose.dy);
    ctx.scale(dir, 1);
    ctx.rotate(pose.rot);
    ctx.scale(pose.sx, pose.sy);
    if (flash) { ctx.globalAlpha = 0.5; ctx.filter = 'brightness(2)'; }
    ctx.drawImage(sprite, -w / 2, -h, w, h);
    ctx.restore();
  }
}
