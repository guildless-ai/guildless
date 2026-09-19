"use client";

import { useEffect, useState } from "react";
import { useOffice } from "../lib/store";
import { gateStatus } from "../lib/flow";
import { CHARACTERS, ZONE_LABELS } from "../lib/zones";
import { COLORS, panelBase } from "../lib/ui";

interface EvidenceBlob {
  highFindings?: number;
  latestFinding?: { severity: string; summary: string; file?: string; fixed: boolean } | null;
}

export function RightPanel({ hidden }: { hidden: boolean }) {
  const memo = useOffice((state) => state._memo ?? []);
  const active = useOffice((state) => state.activeCharacter);
  const role = useOffice((state) => state.role);
  const task = useOffice((state) => state.task);
  const progress = useOffice((state) => state.progress);
  const findings = useOffice((state) => state.findings);
  const tests = useOffice((state) => state.tests);
  const verdict = useOffice((state) => state.verdict);
  const paused = useOffice((state) => state.paused);
  const cameraMode = useOffice((state) => state.cameraMode);
  const setCameraMode = useOffice((state) => state.setCameraMode);
  const applyControl = useOffice((state) => state.applyControl);
  const selectEmployee = useOffice((state) => state.selectEmployee);
  const viewTarget = useOffice((state) => state.viewTarget);
  const targetZone = useOffice((state) => state.agents[active].targetZone);
  const [evidence, setEvidence] = useState<EvidenceBlob | null>(null);
  const [priorityInput, setPriorityInput] = useState("");
  const [productRunId, setProductRunId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events")
      .then((response) => response.json())
      .then((data) => setEvidence((data.evidence as EvidenceBlob) ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/latest-product-run")
      .then((res) => (res.ok ? res.json() : { runId: null }))
      .then((data: { runId: string | null }) => setProductRunId(data.runId))
      .catch(() => setProductRunId(null));
  }, []);

  const gates = gateStatus(memo);
  const summary = memo.find((event) => event.type === "summary");
  const human = typeof summary?.humanInterventions === "number" ? Number(summary.humanInterventions) : 0;
  const spec = CHARACTERS[active];
  const hasActivity = memo.length > 0;
  const verdictColor = verdict === "ACCEPTED" ? COLORS.accepted : verdict === "REJECTED" ? COLORS.rejected : hasActivity ? "#facc15" : "#64748b";
  const elapsed = useElapsed(memo);
  const statusValue = verdict === "ACCEPTED"
    ? "Done — accepted"
    : verdict === "REJECTED"
      ? "Done — rejected"
      : !hasActivity
        ? "idle — waiting for work"
        : paused
          ? "paused"
          : "working";

  return (
    <aside style={{ ...panelBase, borderRight: "none", borderLeft: "1px solid #1e293b", display: hidden ? "none" : "block", overflowY: "auto", maxHeight: "calc(100vh - 84px)" }}>
      <Section title="Active agent">
        <Row label="Agent" value={spec.displayName} color={spec.accent} />
        {!verdict && (
          <>
            <Row label="Role" value={role ?? "—"} />
            <Row label="Task" value={task} />
            <Row label="Room" value={targetZone ? ZONE_LABELS[targetZone] : "—"} />
            <Row label="Elapsed" value={elapsed} />
          </>
        )}
        <Row label="Status" value={statusValue} color={hasActivity ? undefined : "#64748b"} />
      </Section>

      <section style={{ marginBottom: 18, background: "rgba(26,92,255,0.08)", border: "1px solid #1a5cff55", borderRadius: 8, padding: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#7dd3fc", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>Result</h3>
        <div style={{ fontSize: 20, fontWeight: 800, color: verdictColor, marginBottom: 6 }}>
          {!hasActivity ? "Idle" : verdict ?? "Working…"}
        </div>
        <Row label="Progress" value={progress ? `${progress.what}: ${progress.done}/${progress.total}` : "—"} />
        {productRunId ? (
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <a href={`/runs/${productRunId}`} style={{ ...btn(false), textDecoration: "none" }}>Open run report</a>
            <a href={`/runs/${productRunId}/artifacts`} style={{ ...btn(false), textDecoration: "none" }}>Open outputs</a>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#64748b" }}>Output not produced yet</div>
        )}
      </section>

      <Section title="Quality">
        {!hasActivity ? (
          <div style={{ color: "#64748b", fontStyle: "italic" }}>Nothing to measure yet — standing by for the first task</div>
        ) : (
          <>
            <Row label="Issues found" value={`${findings} — all resolved before acceptance`} />
            {verdict ? null : <Row label="Critical" value={evidence?.highFindings != null ? String(evidence.highFindings) : "—"} />}
            <Row label="Tests passed" value={tests.total > 0 ? `${tests.passed}/${tests.total}` : verdict ? "all passed" : "—"} />
            <Row label="Code builds" value={verdict ? "passed (verified)" : gates.build === null ? "—" : gates.build ? "PASS" : "FAIL"} />
            <Row label="Code style" value={verdict ? "passed (verified)" : gates.lint === null ? "—" : gates.lint ? "PASS" : "FAIL"} />
            <Row label="Human asks" value={String(human)} />
          </>
        )}
      </Section>

      {hasActivity ? (
        <Section title="Latest finding">
          {evidence?.latestFinding ? (
            <div>
              <div style={{ color: evidence.latestFinding.severity === "high" || evidence.latestFinding.severity === "critical" ? COLORS.rejected : COLORS.review }}>
                [{evidence.latestFinding.severity}]
              </div>
              <div style={{ fontSize: 13, color: "#cbd5e1" }}>{evidence.latestFinding.summary}</div>
              {evidence.latestFinding.file ? <div style={{ fontSize: 12, color: "#64748b" }}>{evidence.latestFinding.file}</div> : null}
              <div style={{ fontSize: 12, color: evidence.latestFinding.fixed ? COLORS.accepted : "#94a3b8" }}>
                {evidence.latestFinding.fixed ? "fixed" : "unresolved"}
              </div>
            </div>
          ) : findings > 0 ? (
            <div style={{ fontSize: 13, color: "#cbd5e1" }}>
              {findings} issue{findings > 1 ? "s" : ""} found — see the run report for details.
            </div>
          ) : (
            <div style={{ color: "#64748b" }}>—</div>
          )}
        </Section>
      ) : null}

      <Section title="Controls">
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {(["director", "engineer", "reviewer"] as const).map((id) => (
            <button key={id} onClick={() => selectEmployee(id)} style={btn(cameraMode === "desk" && viewTarget === id)}>
              <span style={{ color: CHARACTERS[id].accent }}>●</span> {CHARACTERS[id].displayName}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button onClick={() => applyControl("pause")} style={btn(paused)}>Pause</button>
          <button onClick={() => applyControl("resume")} style={btn(false)}>Resume</button>
          <button onClick={() => applyControl("retry")} style={btn(false)}>Retry</button>
          <button onClick={() => setCameraMode("god")} style={btn(cameraMode === "god")}>Overview</button>
          <button onClick={() => setCameraMode("orbit")} style={btn(cameraMode === "orbit")}>Orbit</button>
          <button onClick={() => setCameraMode("desk")} style={btn(cameraMode === "desk")}>Follow</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            value={priorityInput}
            onChange={(event) => setPriorityInput(event.target.value)}
            placeholder="prioritize target…"
            style={{ flex: 1, background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 6, padding: 6, fontSize: 13 }}
          />
          <button
            onClick={() => { applyControl("prioritize", priorityInput || undefined); setPriorityInput(""); }}
            style={btn(false)}
          >
            Prioritize
          </button>
        </div>
      </Section>
    </aside>
  );
}

function useElapsed(events: Array<{ type: string; ts?: string; elapsedMs?: number }>): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const summary = events.find((event) => event.type === "summary");
  const start = events.find((event) => event.type === "run_start");
  const ms = summary?.elapsedMs != null ? Number(summary.elapsedMs) : start ? now - Date.parse(String(start.ts)) : 0;  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#7dd3fc", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
      <span style={{ color: "#64748b", minWidth: 72 }}>{label}</span>
      <span style={{ color: color ?? "#e2e8f0", fontWeight: color ? 700 : 400 }}>{value}</span>
    </div>
  );
}

function btn(active: boolean): React.CSSProperties {
  return {
    background: active ? "#7c3aed" : "#0f172a",
    color: "#f8fafc",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 14
  };
}
