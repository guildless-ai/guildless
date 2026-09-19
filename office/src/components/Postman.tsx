"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { agentPositions, useOffice } from "../lib/store";
import { clampToSafe } from "../lib/bounds";

const FLY_MS = 1100;
const START = new THREE.Vector3(0, 4.5, 6);

/** The GitHub issue travels as an envelope: Director → Engineer → Reviewer → Verifier, then a stamp. */
export function Postman() {
  const postman = useOffice((state) => state.postman);
  const group = useRef<THREE.Group>(null);
  const flight = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t: number } | null>(null);
  const lastSeq = useRef(-1);
  const [tag, setTag] = useState<string | null>(null);
  const [stamp, setStamp] = useState<"accepted" | "rejected" | null>(null);
  const tagUntil = useRef(0);
  const stampUntil = useRef(0);

  useFrame((_, delta) => {
    if (postman.seq !== lastSeq.current) {
      lastSeq.current = postman.seq;
      if (postman.stamp) {
        stampUntil.current = Date.now() + 2500;
        setStamp(postman.stamp);
      } else if (postman.target) {
        const target = agentPositions[postman.target];
        const to = new THREE.Vector3(target.x, target.y + 2.0, target.z);
        const from = postman.from
          ? new THREE.Vector3(agentPositions[postman.from].x, agentPositions[postman.from].y + 2.0, agentPositions[postman.from].z)
          : new THREE.Vector3(-9, 6, -0.5);
        flight.current = { from, to, t: 0 };
        tagUntil.current = Date.now() + 1700;
        setTag(postman.target === "director" ? "📦 New Issue" : "Handoff");
      }
    }
    const groupRef = group.current;
    if (groupRef && flight.current) {
      flight.current.t = Math.min(1, flight.current.t + (delta * 1000) / FLY_MS);
      const f = flight.current;
      groupRef.position.lerpVectors(f.from, f.to, f.t);
      groupRef.position.y = f.from.y + (f.to.y - f.from.y) * f.t + Math.sin(f.t * Math.PI) * 1.5;
      if (f.t >= 1) flight.current = null;
    }
    if (Date.now() > tagUntil.current) setTag(null);
    if (Date.now() > stampUntil.current) setStamp(null);
  });

  if (postman.seq < 0) return null;
  if (!tag && !stamp && !flight.current) return null;

  return (
    <group ref={group} position={[-9, 6, -0.5]}>
      {!stamp && (
        <Html center zIndexRange={[30, 0]}>
          <div style={{ fontSize: 34, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }}>✉️</div>
        </Html>
      )}
      {tag && (
        <Html position={[0, 1.8, 0]} center zIndexRange={[30, 0]}>
          <div style={{ background: "rgba(2,6,23,0.92)", border: "1px solid #334155", borderRadius: 6, padding: "3px 9px", fontSize: 13, color: "#e2e8f0", fontFamily: "ui-sans-serif, system-ui, sans-serif", whiteSpace: "nowrap" }}>
            {tag}
          </div>
        </Html>
      )}
      {stamp && (
        <Html center zIndexRange={[40, 0]}>
          <div style={{ fontSize: 44, color: stamp === "accepted" ? "#22c55e" : "#ef4444", transform: "rotate(-12deg)" }}>
            {stamp === "accepted" ? "✔" : "✘"}
          </div>
        </Html>
      )}
    </group>
  );
}
