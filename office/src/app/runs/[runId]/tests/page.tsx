import { readJson } from "@/lib/runOutputs";
import { RunShell, NotProduced } from "@/components/RunShell";

export const dynamic = "force-dynamic";

export default async function RunTests({ params }: { params: { runId: string } }) {
  const runId = params.runId;
  const tests = await readJson<{ pass?: boolean; assertions?: Array<{ id: string; ok: boolean; detail?: string }> }>(runId, "tests.json");

  return (
    <RunShell runId={runId} active="Tests" title="Tests and machine assertions">
      <section>
        <h2 style={{ fontSize: "14px", color: "#1a5cff" }}>Result</h2>
        {tests ? (
          <p style={{ fontSize: "16px" }}>{tests.pass ? "PASS — all machine assertions ok" : "FAIL"}</p>
        ) : (
          <NotProduced what="tests.json" />
        )}
      </section>
      <section style={{ marginTop: "24px" }}>
        <h2 style={{ fontSize: "14px", color: "#1a5cff" }}>Assertions</h2>
        {tests?.assertions?.length ? (
          <ul style={{ fontSize: "13px", lineHeight: "1.8", listStyle: "none", padding: 0 }}>
            {tests.assertions.map((a) => (
              <li key={a.id}>
                <span style={{ color: a.ok ? "#3fb950" : "#f85149" }}>{a.ok ? "PASS" : "FAIL"}</span>{" "}
                <code>{a.id}</code> {a.detail ? <span style={{ color: "#9a9a9a" }}>— {a.detail}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <NotProduced what="assertions" />
        )}
      </section>
    </RunShell>
  );
}
