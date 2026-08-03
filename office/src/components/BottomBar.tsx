"use client";

import { useEffect, useState } from "react";
import { useOffice } from "../lib/store";
import { runStartedAt } from "../lib/flow";
import { useRunFeed } from "../lib/useRunFeed";
import { VoiceButton } from "./VoiceButton";
import { BOTTOM_BAR_HEIGHT } from "../lib/ui";

interface TokenEvent {
  type: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  providerChargeUsd?: number | null;
}

export function BottomBar() {
  const subtitles = useOffice((state) => state.subtitles);
  const memo = useOffice((state) => state._memo ?? []);
  const feed = useRunFeed();
  const [now, setNow] = useState(Date.now());
  const [productRunId, setProductRunId] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    void fetch("/api/latest-product-run")
      .then((res) => (res.ok ? res.json() : { runId: null }))
      .then((data: { runId: string | null }) => setProductRunId(data.runId))
      .catch(() => setProductRunId(null));
  }, []);

  const start = runStartedAt(memo);
  const summary = memo.find((event) => (event as { type?: string }).type === "summary") as { elapsedMs?: number } | undefined;
  const runtimeMs = summary?.elapsedMs != null ? Number(summary.elapsedMs) : start ? now - Date.parse(start) : 0;
  const seconds = Math.max(0, Math.round(runtimeMs / 1000));
  const runtime = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

  let tokens = 0;
  let cost: number | null = null;
  let anyTokens = false;
  for (const event of memo as TokenEvent[]) {
    if (event.type !== "agent_end") continue;
    const t = (event.inputTokens ?? 0) + (event.outputTokens ?? 0);
    if (t > 0) anyTokens = true;
    tokens += t;
    const charge = event.providerChargeUsd != null ? event.providerChargeUsd : event.estimatedCostUsd;
    if (typeof charge === "number") cost = (cost ?? 0) + charge;
  }
  const tokensLabel = anyTokens ? tokens.toLocaleString() : null;
  const costLabel = cost != null ? `$${cost.toFixed(4)}` : null;
  const aiResponse = subtitles[subtitles.length - 1] ?? "—";

  return (
    <footer style={{ height: BOTTOM_BAR_HEIGHT, background: "#0b1220", borderTop: "1px solid #1e293b", display: "flex", gap: 16, alignItems: "center", padding: "0 14px", boxSizing: "border-box", color: "#e2e8f0", fontSize: 14, fontFamily: "ui-sans-serif, system-ui, sans-serif", overflow: "hidden" }}>
      <VoiceButton />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 2 }}>Transcript / AI</div>
        <div style={{ fontSize: 14, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{aiResponse}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 12, color: "#64748b" }}>runtime</div>
        <div style={{ fontSize: 14 }}>{runtime}</div>
      </div>
      {tokensLabel != null && (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>tokens</div>
          <div style={{ fontSize: 14 }}>{tokensLabel}</div>
        </div>
      )}
      {costLabel != null && (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>est. cost</div>
          <div style={{ fontSize: 14 }}>{costLabel}</div>
        </div>
      )}
      {productRunId ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <a href={`/runs/${productRunId}`} style={btn(false) as React.CSSProperties}>Open run report</a>
          <a href={`/runs/${productRunId}/artifacts`} style={btn(false) as React.CSSProperties}>Open outputs</a>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select value={feed.selected} onChange={(event) => feed.setSelected(event.target.value)} style={selectStyle}>
          <option value="">run…</option>
          {feed.runIds.map((id) => <option key={id} value={id}>{shortId(id)}</option>)}
        </select>
        <button onClick={() => void feed.play15s()} disabled={!feed.selected || feed.replaying} style={btn(false)}>▶ 15s</button>
        <button onClick={() => void feed.playReplay(30)} disabled={!feed.selected || feed.replaying} style={btn(false)}>▶ Fast</button>
        <button onClick={feed.toggleLive} style={btn(feed.live)}>{feed.live ? "● Watching for work" : "Watch live"}</button>
        {feed.replaying && <span style={{ color: "#facc15", fontSize: 13 }}>replaying…</span>}
      </div>
    </footer>
  );
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

const selectStyle: React.CSSProperties = {  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 6,
  padding: 6,
  fontSize: 14,
  maxWidth: 180
};

function btn(active: boolean): React.CSSProperties {
  return {
    display: "inline-block",
    textDecoration: "none",
    background: active ? "#7c3aed" : "#0f172a",
    color: "#f8fafc",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 14
  };
}
