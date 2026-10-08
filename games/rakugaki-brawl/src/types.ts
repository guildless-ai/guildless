export interface Point { x: number; y: number }

export type Color = 'black' | 'red' | 'green' | 'blue';

export interface Stroke {
  points: Point[];
  color: Color;
  width: number;
}

export interface Drawing {
  strokes: Stroke[];
  /** Canvas size the strokes were drawn on. */
  width: number;
  height: number;
}

export interface Stats {
  hp: number;
  atk: number;
  /** Attacks per second. */
  spd: number;
  /** Attack range in arena pixels. */
  reach: number;
  /** Total ink used (area units). */
  ink: number;
  /** Number of sharp corners detected. */
  spikes: number;
  element: Color;
  bbox: { x: number; y: number; w: number; h: number };
  /** Flat damage reduction per hit taken (from closed loops). */
  armor: number;
  /** Added to the attacker's crit chance (from eyes). */
  critBonus: number;
  traits: { loops: number; eyes: number; legs: number; arms: number };
}
