import type { Phase, Pose } from './anim.js';

/** What a renderer needs to draw one fighter. */
export interface FighterView {
  name: string;
  color: string;
  /** Frame size in px; every frame() result has exactly this size. */
  width: number;
  height: number;
  /** Rasterise the doodle for time t in the given phase (limbs posed, boil applied). */
  frame(t: number, phase: Phase): HTMLCanvasElement;
}

export interface Popup {
  /** Arena x in px. */
  x: number;
  text: string;
  color: string;
  /** 1 -> 0 over its lifetime. */
  life: number;
}

export interface ReplayState {
  t: number;
  xA: number;
  xB: number;
  poseA: Pose;
  poseB: Pose;
  phaseA: Phase;
  phaseB: Phase;
  hpA: number;
  hpB: number;
  hpA0: number;
  hpB0: number;
  popups: Popup[];
  /** Remaining screen shake amplitude in px. */
  shake: number;
  flashA: boolean;
  flashB: boolean;
}

export interface ArenaRenderer {
  setFighters(a: FighterView, b: FighterView): void;
  draw(s: ReplayState): void;
  /** Show only the enemy, idle, before the round starts. */
  preview(b: FighterView, xB: number): void;
}

/** Index of the boil variant to show at time t (8 fps). */
export function boilIndex(t: number, count: number): number {
  return Math.floor(t * 8) % Math.max(1, count);
}
