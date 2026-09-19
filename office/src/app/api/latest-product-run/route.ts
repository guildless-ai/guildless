import { readdir } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = path.resolve(process.cwd(), "..", ".guildless", "runs");
  let runId: string | null = null;
  try {
    const entries = (await readdir(runs, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    if (entries.length > 0) runId = entries[entries.length - 1];
  } catch {
    runId = null;
  }
  return Response.json({ runId });
}
