import { readJson } from "@/lib/runOutputs";
import { RunShell, NotProduced } from "@/components/RunShell";

export const dynamic = "force-dynamic";

export default async function RunFindings({ params }: { params: { runId: string } }) {
  const runId = params.runId;
  const findings = await readJson<Array<{ id: string; severity: string; observed: string; expected: string; status: string; owner: string }>>(runId, "findings.json");

  return (
    <RunShell runId={runId} active="Findings" title="Self-generated issues">
      <section>
        {findings && findings.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px", borderBottom: "1px solid #333" }}>Severity</th>
                <th style={{ textAlign: "left", padding: "6px", borderBottom: "1px solid #333" }}>Finding</th>
                <th style={{ textAlign: "left", padding: "6px", borderBottom: "1px solid #333" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => (
                <tr key={finding.id}>
                  <td style={{ padding: "6px", borderBottom: "1px solid #222" }}>{finding.severity}</td>
                  <td style={{ padding: "6px", borderBottom: "1px solid #222" }}>{finding.observed}</td>
                  <td style={{ padding: "6px", borderBottom: "1px solid #222" }}>{finding.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <NotProduced what="findings.json" />
        )}
      </section>
    </RunShell>
  );
}
