import * as THREE from "three";
import { CAMERA } from "./zones";

export interface CameraTween {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
  duration: number;
}

export function createTween(
  fromPos: THREE.Vector3,
  fromTarget: THREE.Vector3,
  toPos: THREE.Vector3,
  toTarget: THREE.Vector3,
  duration: number = CAMERA.tweenDurationMs
): CameraTween {
  return { fromPos, toPos, fromTarget, toTarget, t: 0, duration };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Advance the tween by `deltaMs`; returns null once finished. */
export function stepTween(tween: CameraTween, deltaMs: number): CameraTween | null {
  const elapsed = tween.t * tween.duration + deltaMs;
  const t = Math.min(1, elapsed / tween.duration);
  if (t >= 1) return null;
  return { ...tween, t };
}

export function tweenValues(tween: CameraTween): { position: THREE.Vector3; target: THREE.Vector3 } {
  const eased = easeInOut(tween.t);
  return {
    position: tween.fromPos.clone().lerp(tween.toPos, eased),
    target: tween.fromTarget.clone().lerp(tween.toTarget, eased)
  };
}
