"use client";

import { useEffect, useState } from "react";
import { useOffice } from "../lib/store";
import { activityFeed, companyFlow } from "../lib/flow";
import { COLORS, panelBase } from "../lib/ui";

interface EvidenceBlob {
  objective?: string;
  changedFiles?: string[];
}

export function LeftPanel({ hidden }: { hidden: boolean }) {
  const memo = useOffice((state) => state._memo ?? []);
  const priority = useOffice((state) => state.priority);
  const eventsApplied = useOffice((state) => state.eventsApplied);
  const [evidence, setEvidence] = useState<EvidenceBlob | null>(null);

  useEffect(() => {
    fetch("/api/events")
      .then((response) => response.json())
      .then((data) => setEvidence((data.evidence as EvidenceBlob) ?? null))
      .catch(() => undefined);
  }, []);

  const flow = companyFlow(memo, evidence ?? {});
  const hasActivity = memo.length > 0;
  const files = hasActivity ? (evidence?.changedFiles ?? []) : [];
  const activities = activityFeed(memo);

  return (
    <aside style={{ ...panelBase, display: hidden ? "none" : "block", overflowY: "auto", maxHeight: "calc(100vh - 84px)" }}>
      <section style={{ marginBottom: 18, background: "rgba(26,92,255,0.08)", border: "1px solid #1a5cff55", borderRadius: 8, padding: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#7dd3fc", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>Goal</h3>
        {hasActivity && evidence?.objective ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.4 }}>{evidence.objective}</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>Why: this request was submitted, so the company is turning it into verified code with tests and a report you can open below.</div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.5 }}>
            GUILDLESS is an AI software company. It takes one request, plans the work, implements it, verifies it, and delivers the result.
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
              Each request produces verified code with tests and a report you can open below. Why: the company exists to deliver working software without manual oversight. Standing by for the next request.
            </div>
          </div>
        )}
      </section>

      <Section title="Work intake">
        <Row label="Run" value={memo.length ? shortId(String(memo[0]?.runId ?? "—")) : "—"} />
        <Row label="Request" value={flow.issue || "Waiting for an issue…"} />
        {priority ? <Row label="Priority" value={priority} /> : null}
        <Row label="Stage" value={hasActivity ? flow.label : "Idle"} />
      </Section>

      <Section title="What changed">
        {files.length === 0 ? (
          <div style={{ color: "#64748b", fontStyle: "italic" }}>Nothing changed yet — waiting for the first task</div>
        ) : (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
              {files.length} file{files.length > 1 ? "s" : ""} modified
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>the produced code — open the report to see the files</div>
          </div>
        )}
      </Section>

      <Section title="Latest activity">
        {activities.length === 0 ? (
          <div style={{ color: "#64748b", fontStyle: "italic" }}>Waiting for the first task</div>
        ) : (
          activities.map((item, index) => (
            <div key={`${item.ts}-${index}`} style={{ fontSize: 13, color: "#cbd5e1", marginBottom: 4 }}>
              <span style={{ color: "#64748b" }}>{item.agent}</span> · {item.action}
              {item.result ? <span style={{ color: item.result === "ok" || item.result === "passed" || item.result === "ACCEPTED" ? COLORS.accepted : item.result === "REJECTED" ? COLORS.rejected : "#94a3b8" }}> → {item.result}</span> : null}
            </div>
          ))
        )}
      </Section>
      <div style={{ color: "#334155", fontSize: 12 }}>events: {eventsApplied}</div>
    </aside>
  );
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
      <span style={{ color: "#64748b", minWidth: 62 }}>{label}</span>
      <span style={{ color: "#e2e8f0", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
