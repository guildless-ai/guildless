import { readJson, readText } from "@/lib/runOutputs";
import { RunShell, NotProduced } from "@/components/RunShell";

export const dynamic = "force-dynamic";

export default async function RunDiff({ params }: { params: { runId: string } }) {
  const runId = params.runId;
  const changedFiles = await readJson<string[]>(runId, "changed-files.json");
  const patch = await readText(runId, "diff.patch");

  return (
    <RunShell runId={runId} active="Diff" title="Changed files">
      <section>
        <h2 style={{ fontSize: "14px", color: "#1a5cff" }}>Files changed</h2>
        {changedFiles && changedFiles.length > 0 ? (
          <ul style={{ fontSize: "14px", lineHeight: "1.8" }}>
            {changedFiles.map((file) => <li key={file}><code>{file}</code></li>)}
          </ul>
        ) : (
          <NotProduced what="changed-files.json" />
        )}
      </section>
      <section style={{ marginTop: "24px" }}>
        <h2 style={{ fontSize: "14px", color: "#1a5cff" }}>Patch</h2>
        {patch && !patch.startsWith("# diff.patch not produced") ? (
          <pre style={{ fontSize: "12px", background: "#0d1117", padding: "12px", borderRadius: "6px", overflowX: "auto", whiteSpace: "pre-wrap" }}>{patch}</pre>
        ) : (
          <NotProduced what="diff.patch" />
        )}
      </section>
    </RunShell>
  );
}
