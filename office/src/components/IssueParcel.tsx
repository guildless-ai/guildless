"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { agentPositions, useOffice } from "../lib/store";

const FLY_MS = 1300;
const HOLD_MS = 2200;

/** Issue parcel that flies in from the top-left corner to the Director. */
export function IssueParcel() {
  const delivery = useOffice((state) => state.issueDelivery);
  const group = useRef<THREE.Group>(null);
  const [arrived, setArrived] = useState(false);
  const start = useRef(new THREE.Vector3(-8, 7, -0.5));

  useFrame((_, delta) => {
    const groupRef = group.current;
    if (!groupRef) return;
    const elapsed = Date.now() - delivery.startedAt;
    const dest = new THREE.Vector3(agentPositions.director.x, agentPositions.director.y + 2.0, agentPositions.director.z);
    if (elapsed < FLY_MS) {
      const t = Math.min(1, elapsed / FLY_MS);
      groupRef.position.lerpVectors(start.current, dest, t);
      groupRef.position.y = start.current.y + (dest.y - start.current.y) * t + Math.sin(t * Math.PI) * 2;
    } else {
      if (!arrived) setArrived(true);
      groupRef.position.lerp(dest, delta * 8);
    }
  });

  if (!delivery.active) return null;
  if (Date.now() - delivery.startedAt > FLY_MS + HOLD_MS) return null;

  return (
    <group ref={group} position={[-8, 7, -0.5]}>
      <Html center zIndexRange={[30, 0]}>
        <div style={{ fontSize: 36, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }}>📦</div>
      </Html>
      {arrived && (
        <Html position={[0, 1.8, 0]} center zIndexRange={[30, 0]}>
          <div style={{ background: "rgba(2,6,23,0.92)", border: "1px solid #334155", borderRadius: 6, padding: "3px 9px", fontSize: 13, color: "#e2e8f0", fontFamily: "ui-sans-serif, system-ui, sans-serif", whiteSpace: "nowrap" }}>
            Issue received
          </div>
        </Html>
      )}
    </group>
  );
}
