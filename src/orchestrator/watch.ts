import path from "node:path";
import { EventLog, readEventsFile } from "./events.js";
import { aggregate, renderDashboardText } from "./dashboard.js";

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

export async function watchCommand(argv: string[], cwd: string): Promise<number> {
  const json = argv.includes("--json");
  const once = argv.includes("--once");
  const quiet = argv.includes("--quiet");
  const file = flag(argv, "file") ?? EventLog.eventsFile(cwd);
  const intervalMs = Math.max(100, Number(flag(argv, "interval") ?? "300"));
  const resolvedFile = path.resolve(cwd, file);

  if (once) {
    const state = aggregate(readEventsFile(resolvedFile));
    if (json) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    else if (!quiet) console.log(renderDashboardText(state));
    return 0;
  }

  if (json) {
    let last = "";
    return await new Promise<number>((resolve) => {
      const timer = setInterval(() => {
        const state = aggregate(readEventsFile(resolvedFile));
        const snapshot = JSON.stringify(state);
        if (snapshot !== last) {
          last = snapshot;
          process.stdout.write(`${snapshot}\n`);
        }
        if (state.finished) {
          clearInterval(timer);
          resolve(state.accepted ? 0 : 1);
        }
      }, intervalMs);
      process.on("SIGINT", () => { clearInterval(timer); resolve(1); });
    });
  }

  if (!process.stdout.isTTY) {
    console.log(renderDashboardText(aggregate(readEventsFile(resolvedFile))));
    return 0;
  }

  try {
    const { startDashboard } = await import("./watch-ui.js");
    const { close, waitUntilExit } = await startDashboard(resolvedFile, intervalMs);
    await waitUntilExit();
    close();
    return 0;
  } catch {
    return await runAnsiFallback(resolvedFile, intervalMs);
  }
}

function runAnsiFallback(file: string, intervalMs: number): Promise<number> {
  return new Promise<number>((resolve) => {
    const timer = setInterval(() => {
      const state = aggregate(readEventsFile(file));
      process.stdout.write(`\x1b[2J\x1b[H${renderDashboardText(state)}`);
      if (state.finished) {
        clearInterval(timer);
        resolve(state.accepted ? 0 : 1);
      }
    }, intervalMs);
    process.on("SIGINT", () => { clearInterval(timer); resolve(1); });
  });
}
