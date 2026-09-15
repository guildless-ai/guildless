import { readText } from "@/lib/runOutputs";
import { RunShell, NotProduced } from "@/components/RunShell";

export const dynamic = "force-dynamic";

export default async function RunReport({ params }: { params: { runId: string } }) {
  const runId = params.runId;
  const report = await readText(runId, "final-report.md");

  return (
    <RunShell runId={runId} active="Report" title="Final report">
      <section>
        {report ? (
          <pre style={{ fontSize: "13px", lineHeight: "1.6", background: "#0d1117", padding: "12px", borderRadius: "6px", overflowX: "auto", whiteSpace: "pre-wrap" }}>{report}</pre>
        ) : (
          <NotProduced what="final-report.md" />
        )}
      </section>
    </RunShell>
  );
}
