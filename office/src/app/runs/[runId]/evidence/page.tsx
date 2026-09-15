import { readText } from "@/lib/runOutputs";
import { RunShell, NotProduced } from "@/components/RunShell";

export const dynamic = "force-dynamic";

export default async function RunEvidence({ params }: { params: { runId: string } }) {
  const runId = params.runId;
  const evidence = await readText(runId, "evidence.json");

  return (
    <RunShell runId={runId} active="Evidence" title="Runtime evidence">
      <section>
        {evidence ? (
          <pre style={{ fontSize: "12px", background: "#0d1117", padding: "12px", borderRadius: "6px", overflowX: "auto", whiteSpace: "pre-wrap" }}>{evidence}</pre>
        ) : (
          <NotProduced what="evidence.json" />
        )}
      </section>
    </RunShell>
  );
}
