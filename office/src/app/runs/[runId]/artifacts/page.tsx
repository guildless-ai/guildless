import { readJson, listRunFiles } from "@/lib/runOutputs";
import { RunShell, NotProduced } from "@/components/RunShell";

export const dynamic = "force-dynamic";

export default async function RunArtifacts({ params }: { params: { runId: string } }) {
  const runId = params.runId;
  const artifacts = await readJson<Record<string, unknown>>(runId, "artifacts.json");
  const files = await listRunFiles(runId);

  return (
    <RunShell runId={runId} active="Artifacts" title="Artifacts">
      <section>
        <h2 style={{ fontSize: "14px", color: "#1a5cff" }}>Produced artifacts</h2>
        {artifacts ? (
          <ul style={{ fontSize: "13px", lineHeight: "1.8", listStyle: "none", padding: 0 }}>
            {Object.entries(artifacts).map(([key, value]) => (
              <li key={key}><strong style={{ color: "#ccc" }}>{key}:</strong> {String(value)}</li>
            ))}
          </ul>
        ) : (
          <NotProduced what="artifacts.json" />
        )}
      </section>
      <section style={{ marginTop: "24px" }}>
        <h2 style={{ fontSize: "14px", color: "#1a5cff" }}>Files in run directory</h2>
        {files.length > 0 ? (
          <ul style={{ fontSize: "12px", lineHeight: "1.7", fontFamily: "monospace", listStyle: "none", padding: 0 }}>
            {files.map((file) => <li key={file}>{file}</li>)}
          </ul>
        ) : (
          <NotProduced what="run directory files" />
        )}
      </section>
    </RunShell>
  );
}
