"use client";

import { useEffect, useState } from "react";
import { Html } from "@react-three/drei";
import { useOffice } from "../lib/store";
import { COLORS } from "../lib/ui";

/** Visible output marker: when a run is accepted, the delivered result is shown in the scene. */
export function ResultMarker() {
  const verdict = useOffice((state) => state.verdict);
  const [productRunId, setProductRunId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/latest-product-run")
      .then((res) => (res.ok ? res.json() : { runId: null }))
      .then((data: { runId: string | null }) => setProductRunId(data.runId))
      .catch(() => setProductRunId(null));
  }, []);

  if (verdict !== "ACCEPTED") return null;

  return (
    <Html position={[0, 1.6, 4.4]} center zIndexRange={[15, 0]}>
      <div
        style={{
          background: "rgba(2,6,23,0.94)",
          border: `2px solid ${COLORS.accepted}`,
          borderRadius: 10,
          padding: "8px 14px",
          textAlign: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif"
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.accepted }}>✓ Result ready</div>
        {productRunId ? (
          <a href={`/runs/${productRunId}`} style={{ display: "inline-block", marginTop: 4, fontSize: 13, color: "#7dd3fc", textDecoration: "underline" }}>
            Open the report
          </a>
        ) : (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Open the report in the bottom bar</div>
        )}
      </div>
    </Html>
  );
}
