"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { agentPositions, useOffice } from "../lib/store";
import { CAMERA, CHARACTERS, ZONE_NAV, type CameraMode, type CharacterId, type ZoneId } from "../lib/zones";
import { createTween, stepTween, tweenValues, type CameraTween } from "../lib/camera";
import { debugState } from "../lib/debugState";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface CameraDest {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

function agentZone(agent: CharacterId): ZoneId {
  const store = useOffice.getState();
  return store.agents[agent].targetZone ?? CHARACTERS[agent].homeZone;
}

function valid(p: { x: number; z: number }): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.z);
}

/** True when the agent is actually sitting at its workstation (not mid-route). */
function agentAtWorkstation(agent: CharacterId): boolean {
  const zone = agentZone(agent);
  const chair = ZONE_NAV[zone].chairPosition;
  const p = agentPositions[agent];
  return valid(p) && Math.hypot(p.x - chair[0], p.z - chair[2]) < 0.4;
}

function godDest(): CameraDest {
  // On narrow viewports the side panels squeeze the canvas: pull the camera
  // back so the whole office stays in frame.
  const narrow = typeof window !== "undefined" && window.innerWidth < 1600;
  const position = narrow
    ? new THREE.Vector3(9, 12.5, 10.5)
    : new THREE.Vector3(...CAMERA.godViewPosition);
  return {
    position,
    target: new THREE.Vector3(...CAMERA.godViewTarget)
  };
}

function deskDest(agent: CharacterId): CameraDest {
  const zone = agentZone(agent);
  const nav = ZONE_NAV[zone];
  return {
    position: new THREE.Vector3(...nav.cameraPosition),
    target: new THREE.Vector3(...nav.cameraTarget)
  };
}

function destinationFor(mode: CameraMode, viewTarget: CharacterId | null): CameraDest {
  if (mode === "desk" && viewTarget && agentAtWorkstation(viewTarget)) {
    return deskDest(viewTarget);
  }
  return godDest();
}

export function CameraRig() {
  const mode = useOffice((state) => state.cameraMode);
  const viewTarget = useOffice((state) => state.viewTarget);
  const camera = useThree((state) => state.camera);
  const controls = useRef<React.ElementRef<typeof OrbitControls> | null>(null);
  const tweenRef = useRef<CameraTween | null>(null);
  const lastDestKey = useRef<string | null>(null);

  const destKey = (dest: CameraDest): string => `${dest.position.x.toFixed(2)},${dest.position.z.toFixed(2)}|${dest.target.x.toFixed(2)},${dest.target.z.toFixed(2)}`;

  useEffect(() => {
    if (mode === "orbit") {
      tweenRef.current = null;
      lastDestKey.current = null;
      return;
    }
    const dest = destinationFor(mode, viewTarget);
    const fromPos = camera.position.clone();
    const fromTarget = controls.current?.target.clone() ?? new THREE.Vector3(...CAMERA.godViewTarget);
    tweenRef.current = createTween(fromPos, fromTarget, dest.position, dest.target);
    lastDestKey.current = destKey(dest);
  }, [mode, viewTarget, camera]);

  useFrame((_, delta) => {
    if (tweenRef.current) {
      const next = stepTween(tweenRef.current, delta * 1000);
      if (next) {
        tweenRef.current = next;
        const { position, target } = tweenValues(next);
        camera.position.copy(position);
        camera.lookAt(target);
        if (controls.current) controls.current.target.copy(target);
      } else {
        tweenRef.current = null;
      }
    } else if (mode === "desk" && viewTarget) {
      // Desk View is fixed to the workstation. When the agent arrives/departs or
      // the workstation changes, tween once; otherwise the camera stays put.
      const dest = destinationFor("desk", viewTarget);
      const key = destKey(dest);
      if (lastDestKey.current !== key) {
        lastDestKey.current = key;
        const fromPos = camera.position.clone();
        const fromTarget = new THREE.Vector3(...CAMERA.godViewTarget);
        tweenRef.current = createTween(fromPos, fromTarget, dest.position, dest.target);
      }
    } else if (mode === "god") {
      camera.lookAt(new THREE.Vector3(...CAMERA.godViewTarget));
    } else if (mode === "orbit" && controls.current) {
      const b = CAMERA.targetBounds;
      controls.current.target.x = clamp(controls.current.target.x, b.minX, b.maxX);
      controls.current.target.y = clamp(controls.current.target.y, b.minY, b.maxY);
      controls.current.target.z = clamp(controls.current.target.z, b.minZ, b.maxZ);
      controls.current.update();
    }

    const pb = CAMERA.positionBounds;
    camera.position.x = clamp(camera.position.x, pb.minX, pb.maxX);
    camera.position.y = clamp(camera.position.y, pb.minY, pb.maxY);
    camera.position.z = clamp(camera.position.z, pb.minZ, pb.maxZ);

    const target = controls.current?.target ?? new THREE.Vector3(...CAMERA.godViewTarget);
    debugState.camera = {
      mode,
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: target.x, y: target.y, z: target.z }
    };
  });

  if (mode !== "orbit") return null;
  return (
    <OrbitControls
      ref={controls}
      enableDamping
      minDistance={CAMERA.minDistance}
      maxDistance={CAMERA.maxDistance}
      minPolarAngle={CAMERA.minPolarAngle}
      maxPolarAngle={CAMERA.maxPolarAngle}
      target={new THREE.Vector3(...CAMERA.godViewTarget)}
    />
  );
}
