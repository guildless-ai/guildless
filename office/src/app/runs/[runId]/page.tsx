import { readJson, readText } from "@/lib/runOutputs";
import { RunShell, NotProduced } from "@/components/RunShell";

export const dynamic = "force-dynamic";

export default async function RunOverview({ params }: { params: { runId: string } }) {
  const runId = params.runId;
  const goal = await readJson<{ goal?: string; audience?: string; doneWhen?: string[] }>(runId, "goal.json");
  const plan = await readJson<{ steps?: Array<{ n: number; title: string; agent: string }> }>(runId, "plan.json");
  const tests = await readJson<{ pass?: boolean }>(runId, "tests.json");
  const debateText = await readText(runId, "debate.jsonl");
  const debate = (debateText ?? "").split("\n").filter(Boolean).map((line) => JSON.parse(line) as { role: string; message: string });

  return (
    <RunShell runId={runId} active="Overview" title="Run overview">
      <section>
        <h2 style={{ fontSize: "14px", color: "#1a5cff" }}>Goal</h2>
        {goal?.goal ? (
          <p style={{ fontSize: "16px", lineHeight: "1.5" }}>{goal.goal}</p>
        ) : (
          <NotProduced what="goal" />
        )}
        {goal?.audience ? <p style={{ fontSize: "13px", color: "#888" }}>Audience: {goal.audience}</p> : null}
      </section>
      <section style={{ marginTop: "24px" }}>
        <h2 style={{ fontSize: "14px", color: "#1a5cff" }}>Plan</h2>
        <ol style={{ fontSize: "14px", lineHeight: "1.8" }}>
          {(plan?.steps ?? []).map((step) => (
            <li key={step.n}>
              {step.n}. {step.title} <span style={{ color: "#888" }}>— {step.agent}</span>
            </li>
          ))}
        </ol>
      </section>
      <section style={{ marginTop: "24px" }}>
        <h2 style={{ fontSize: "14px", color: "#1a5cff" }}>Debate</h2>
        {debate.length === 0 ? <NotProduced what="debate" /> : (
          <ul style={{ fontSize: "13px", lineHeight: "1.6", listStyle: "none", padding: 0 }}>
            {debate.map((entry, i) => (
              <li key={i}>
                <strong style={{ color: "#ccc" }}>{entry.role}:</strong> {entry.message}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section style={{ marginTop: "24px" }}>
        <h2 style={{ fontSize: "14px", color: "#1a5cff" }}>Verdict</h2>
        <p style={{ fontSize: "16px" }}>{tests ? (tests.pass ? "PASS" : "FAIL") : "Pending"}</p>
      </section>
    </RunShell>
  );
}
