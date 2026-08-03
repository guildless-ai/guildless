import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createTween, stepTween, tweenValues } from "../src/lib/camera";
import { CAMERA } from "../src/lib/zones";

describe("camera tween", () => {
  it("reaches the fixed God View and stays there (no oscillation)", () => {
    const fromPos = new THREE.Vector3(0, 0, 0);
    const fromTarget = new THREE.Vector3(0, 0, 0);
    const toPos = new THREE.Vector3(...CAMERA.godViewPosition);
    const toTarget = new THREE.Vector3(...CAMERA.godViewTarget);
    let tween: ReturnType<typeof createTween> | null = createTween(fromPos, fromTarget, toPos, toTarget, CAMERA.tweenDurationMs);
    let steps = 0;
    while (tween && steps < 100) {
      tween = stepTween(tween, 30);
      steps += 1;
    }
    expect(tween).toBeNull(); // tween finished

    const values = tweenValues({ ...createTween(fromPos, fromTarget, toPos, toTarget, 100), t: 1 });
    expect(values.position.distanceTo(toPos)).toBeLessThan(1e-3);
    expect(values.target.distanceTo(toTarget)).toBeLessThan(1e-3);
  });

  it("returns null once the transition is complete (camera stays fixed)", () => {
    const tween = createTween(
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(1, 2, 3),
      new THREE.Vector3(0, 1, 0),
      100
    );
    expect(stepTween(tween, 1000)).toBeNull();
  });
});
