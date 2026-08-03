"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Html } from "@react-three/drei";
import * as THREE from "three";
import { agentPositions, useOffice } from "../lib/store";
import { CHARACTERS, COFFEE_SPOT, WALK_SPEED, ZONE_NAV, type CharacterId } from "../lib/zones";
import { clampToSafe } from "../lib/bounds";
import { debugState } from "../lib/debugState";
import { initMovement, stepMovement, type MovementState, type Point2D } from "../lib/movement";

interface IdleState {
  mode: "toCoffee" | "atCoffee" | "back" | "stretch" | null;
  until: number;
  path: Point2D[];
  index: number;
}

const CELEBRATE_MS = 2000;
const WARN_MS = 1500;

export function AgentCharacter({ id }: { id: CharacterId }) {
  const spec = CHARACTERS[id];
  const group = useRef<THREE.Group>(null);
  const warnLight = useRef<THREE.PointLight>(null);
  const { scene, animations } = useGLTF(spec.model);
  const { actions, names } = useAnimations(animations, group);

  const targetZone = useOffice((state) => state.agents[id].targetZone);
  const celebrationAt = useOffice((state) => state.agents[id].celebrationAt);
  const warningAt = useOffice((state) => state.agents[id].warningAt);
  const active = useOffice((state) => state.activeCharacter);
  const selectEmployee = useOffice((state) => state.selectEmployee);
  const reviewFlag = useOffice((state) => state.reviewFlag);

  const nav = ZONE_NAV[spec.homeZone];
  const movement = useRef<MovementState>(initMovement(spec.homeZone, {
    approach: { x: nav.approachPosition[0], z: nav.approachPosition[2] },
    chair: { x: nav.chairPosition[0], z: nav.chairPosition[2] }
  }));
  const idle = useRef<IdleState>({ mode: null, until: 0, path: [], index: 0 });
  const idleTimer = useRef(8000 + Math.random() * 9000);
  const prevPos = useRef<Point2D>({ x: nav.chairPosition[0], z: nav.chairPosition[2] });

  const walkClip = spec.walkUsesClip
    ? (names.find((name) => /walk|move|run|scene|armature/i.test(name)) ?? names[0] ?? undefined)
    : undefined;
  const idleClip = spec.idleClip && names.includes(spec.idleClip) ? spec.idleClip : undefined;

  const playOnly = (name: string | undefined) => {
    for (const action of Object.values(actions)) action?.stop();
    if (name && actions[name]) actions[name].play();
  };

  useFrame((frameState, delta) => {
    const groupRef = group.current;
    if (!groupRef) return;
    const now = Date.now();
    const time = frameState.clock.elapsedTime;
    const celebrating = now - celebrationAt < CELEBRATE_MS;
    const warning = now - warningAt < WARN_MS;
    const zone = targetZone ?? spec.homeZone;
    const navFor = ZONE_NAV[zone];
    const maxStep = delta * WALK_SPEED;

    // Idle scheduling: only non-active employees while working.
    if (!celebrating && movement.current.state === "WORKING" && active !== id) {
      idleTimer.current -= delta * 1000;
      if (idle.current.mode === null && idleTimer.current <= 0) {
        idleTimer.current = 8000 + Math.random() * 9000;
        idle.current = Math.random() < 0.6
          ? {
              mode: "toCoffee",
              until: 0,
              path: [
                { x: COFFEE_SPOT[0], z: COFFEE_SPOT[2] },
                { x: navFor.chairPosition[0], z: navFor.chairPosition[2] }
              ],
              index: 0
            }
          : { mode: "stretch", until: now + 2500, path: [], index: 0 };
      }
    }

    let moving = false;
    let targetY = 0;

    if (celebrating) {
      // happy hops (no spin — celebration plays once, never loops visually)
      targetY = Math.abs(Math.sin(time * 12)) * 0.5;
    } else {
      const idl = idle.current;
      if (idl.mode === "toCoffee" || idl.mode === "back") {
        const goal = idl.path[idl.index];
        const dx = goal.x - groupRef.position.x;
        const dz = goal.z - groupRef.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= 0.1) {
          if (idl.mode === "toCoffee") {
            idl.mode = "atCoffee";
            idl.until = now + 2500;
          } else {
            idl.mode = null;
            movement.current.position = { x: groupRef.position.x, z: groupRef.position.z };
          }
        } else {
          const step = Math.min(maxStep, distance);
          groupRef.position.x += (dx / distance) * step;
          groupRef.position.z += (dz / distance) * step;
          groupRef.rotation.y = Math.atan2(dx, dz);
          moving = true;
        }
      } else if (idl.mode === "atCoffee") {
        if (now >= idl.until) idl.mode = "back";
      } else if (idl.mode === "stretch") {
        if (now >= idl.until) idl.mode = null;
      }

      if (idl.mode === null) {
        const prevX = groupRef.position.x;
        const prevZ = groupRef.position.z;
        const prev = movement.current;
        const next = stepMovement(
          prev,
          zone,
          {
            approach: { x: navFor.approachPosition[0], z: navFor.approachPosition[2] },
            chair: { x: navFor.chairPosition[0], z: navFor.chairPosition[2] }
          },
          { x: 0, z: 5 },
          maxStep
        );
        movement.current = next;
        groupRef.position.x = next.position.x;
        groupRef.position.z = next.position.z;
        const dx = next.position.x - prevX;
        const dz = next.position.z - prevZ;
        if (dx !== 0 || dz !== 0) groupRef.rotation.y = Math.atan2(dx, dz);
        moving = next.state === "MOVING";
        if (prev.state === "MOVING" && next.state === "WORKING") {
          // arrived: rotate once toward the monitor
          const look = navFor.lookTarget;
          groupRef.rotation.y = Math.atan2(look[0] - groupRef.position.x, look[2] - groupRef.position.z);
        }
      }
    }

    // Engineer types at the keyboard while working at the engineering desk.
    const typing = id === "engineer" && zone === "engineering" && !moving && !celebrating && movement.current.state === "WORKING";
    if (typing) {
      groupRef.rotation.z = Math.sin(time * 18) * 0.03;
      targetY += Math.abs(Math.sin(time * 18)) * 0.008;
    } else if (!spec.walkUsesClip && !idleClip && !moving && !celebrating && movement.current.state === "WORKING") {
      groupRef.rotation.z = Math.sin(time * 4) * 0.04;
      targetY += Math.sin(time * 6) * 0.012;
    } else if (!celebrating) {
      groupRef.rotation.z += (0 - groupRef.rotation.z) * delta * 6;
    }

    // haniwa (no legs): small hop + tilt while moving.
    if (!spec.walkUsesClip && moving) {
      groupRef.rotation.x = 0.1;
      targetY += Math.abs(Math.sin(time * 9)) * 0.12;
    } else {
      groupRef.rotation.x += (0 - groupRef.rotation.x) * delta * 6;
    }

    // Single smoothed Y — no additive fighting, no jitter.
    groupRef.position.y += (targetY - groupRef.position.y) * delta * 8;

    if (moving && walkClip) {
      playOnly(walkClip);
    } else if (!moving && !celebrating && movement.current.state === "WORKING" && idleClip) {
      playOnly(idleClip);
    } else {
      playOnly(undefined);
    }

    if (warning) {
      groupRef.position.x += Math.sin(time * 40) * 0.02;
      groupRef.position.z += Math.cos(time * 37) * 0.02;
    }
    if (warnLight.current) warnLight.current.intensity = warning ? 2.5 : 0;

    // Hard clamp: agents must never leave the office map.
    const clamped = clampToSafe({ x: groupRef.position.x, z: groupRef.position.z });
    groupRef.position.x = clamped.x;
    groupRef.position.z = clamped.z;

    agentPositions[id] = { x: groupRef.position.x, y: groupRef.position.y, z: groupRef.position.z };

    const moved = Math.hypot(clamped.x - prevPos.current.x, clamped.z - prevPos.current.z);
    prevPos.current = { x: clamped.x, z: clamped.z };
    debugState.agents[id] = {
      position: { x: groupRef.position.x, y: groupRef.position.y, z: groupRef.position.z },
      rotation: { x: groupRef.rotation.x, y: groupRef.rotation.y, z: groupRef.rotation.z },
      targetZone: zone,
      velocity: delta > 0 ? moved / delta : 0,
      atWorkstation: movement.current.state === "WORKING"
    };
  });

  return (
    <group ref={group} position={[...ZONE_NAV[spec.homeZone].chairPosition]} onClick={(event) => { event.stopPropagation(); selectEmployee(id); }}>
      <primitive object={scene} scale={spec.scale} position={[0, spec.yOffset, 0]} />
      <pointLight ref={warnLight} color="#ef4444" intensity={0} distance={2.5} />
      <Html position={[0, 2.3, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: spec.accent, fontSize: 13, fontWeight: 700, fontFamily: "ui-sans-serif, system-ui, sans-serif", textShadow: "0 1px 3px #000", whiteSpace: "nowrap", lineHeight: 1 }}>
          {spec.displayName}
        </div>
      </Html>
      {id === "reviewer" && reviewFlag.count > 0 && Date.now() - reviewFlag.at < 2500 && (
        <Html position={[0, 3.2, 0]} center zIndexRange={[40, 0]}>
          <div style={{ background: "#7f1d1d", border: "2px solid #ef4444", color: "#fecaca", borderRadius: 8, padding: "4px 10px", fontSize: 14, fontWeight: 700, fontFamily: "ui-sans-serif, system-ui, sans-serif", whiteSpace: "nowrap" }}>
            🔴 {reviewFlag.count} issue{reviewFlag.count > 1 ? "s" : ""}
          </div>
        </Html>
      )}
    </group>
  );
}
