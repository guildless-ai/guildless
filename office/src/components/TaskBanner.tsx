"use client";

import { useEffect, useState } from "react";
import { useOffice } from "../lib/store";
import { COLORS } from "../lib/ui";

/** Big center overlay so first-time viewers instantly see what the company is doing. */
export function TaskBanner() {
  const role = useOffice((state) => state.role);
  const task = useOffice((state) => state.task);
  const progress = useOffice((state) => state.progress);
  const verdict = useOffice((state) => state.verdict);
  const eventsApplied = useOffice((state) => state.eventsApplied);
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

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const detail = role === "builder" || role === "verifier" ? (file ? ` ${file}` : "") : "";
  const verdictColor = verdict === "ACCEPTED" ? COLORS.accepted : verdict === "REJECTED" ? COLORS.rejected : undefined;
  const headline = verdict
    ? `Result: ${verdict === "ACCEPTED" ? "accepted" : verdict === "REJECTED" ? "rejected" : verdict}`
    : `${role ?? "Guildless"} is ${task}`;

  if (eventsApplied === 0) return null;

  return (
    <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", textAlign: "center", pointerEvents: "none", width: 360, maxWidth: "88%", zIndex: 12 }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>{verdict ? "Finished" : "Now"}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: verdictColor ?? "#f1f5f9", background: "rgba(2,6,23,0.82)", border: "1px solid #1e293b", borderRadius: 8, padding: "6px 12px" }}>
        {headline}
        {!verdict && <span style={{ color: COLORS.engineering }}>{detail}</span>}
      </div>
      {!verdict && progress && progress.total > 0 && (
        <div style={{ marginTop: 4, background: "rgba(2,6,23,0.82)", border: "1px solid #1e293b", borderRadius: 6, padding: "4px 8px" }}>
          <div style={{ background: "#1e293b", borderRadius: 4, height: 10, overflow: "hidden" }}>
            <div style={{ background: COLORS.engineering, height: "100%", width: `${percent}%` }} />
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            {progress.what}: {progress.done}/{progress.total} · {percent}%
          </div>
        </div>
      )}
    </div>
  );
}
