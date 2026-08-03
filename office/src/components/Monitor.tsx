"use client";

import { useEffect, useState } from "react";
import { Html } from "@react-three/drei";
import { useOffice } from "../lib/store";
import { COLORS } from "../lib/ui";

interface ScreenData {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

function Screen({ position, data }: { position: [number, number, number]; data: ScreenData }) {
  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={[1.1, 0.7]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
      <Html position={[0, 0, 0.02]} center zIndexRange={[20, 0]}>
          <div
            style={{
              background: "#0f172a",
              border: `1px solid ${data.color ?? "#334155"}`,
              borderRadius: 6,
              padding: "5px 10px",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: 13,
              color: data.color ?? "#4ade80",
              textAlign: "center",
              minWidth: 120
            }}
          >
          <div style={{ color: "#94a3b8", fontSize: 11 }}>{data.label}</div>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15 }}>{data.value}</div>
          {data.sub ? <div style={{ fontSize: 11, color: "#e2e8f0", whiteSpace: "nowrap" }}>{data.sub}</div> : null}
        </div>
      </Html>
    </group>
  );
}

export function Monitor() {
  const task = useOffice((state) => state.task);
  const role = useOffice((state) => state.role);
  const findings = useOffice((state) => state.findings);
  const tests = useOffice((state) => state.tests);
  const [file, setFile] = useState("");

  useEffect(() => {
    fetch("/api/events")
      .then((response) => response.json())
      .then((data) => {
        const first = (data as { evidence?: { changedFiles?: string[] } }).evidence?.changedFiles?.[0];
        if (first) setFile(String(first));
      })
      .catch(() => undefined);
  }, []);

  const testsLabel = tests.total > 0 ? `${tests.passed}/${tests.total}` : "—";
  const testsColor = tests.total > 0 && tests.passed === tests.total ? COLORS.accepted : COLORS.rejected;

  return (
    <group>
      <Screen
        position={[-5.0, 2.8, 8.4]}
        data={{ label: role ?? "Builder", value: `📄 ${file || "…"}`, sub: task, color: COLORS.engineering }}
      />
      <Screen
        position={[-1.5, 2.8, 8.4]}
        data={{ label: "Reviewer", value: findings > 0 ? `🔴 ${findings} findings` : "Reviewing", sub: "review", color: COLORS.review }}
      />
      <Screen
        position={[2.0, 2.8, 8.4]}
        data={{ label: "Verifier", value: tests.total > 0 ? `${testsLabel} PASS` : "Running checks", sub: "tests", color: testsColor }}
      />
    </group>
  );
}
