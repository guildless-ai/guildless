import React, { useEffect, useState } from "react";
import { Box, render, Text, useApp } from "ink";
import { aggregate, formatElapsed, type DashboardState } from "./dashboard.js";
import { readEventsFile } from "./events.js";

function stageColor(status: string): string {
  if (status === "ok") return "green";
  if (status === "fail") return "red";
  if (status === "running") return "cyan";
  return "gray";
}

function stageIcon(status: string): string {
  if (status === "ok") return "✓";
  if (status === "fail") return "✗";
  if (status === "running") return "…";
  if (status === "skipped") return "-";
  return "•";
}

function Bar({ done, total }: { done: number; total: number }): React.ReactElement {
  const width = 18;
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  return <Text>{`[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${done}/${total}`}</Text>;
}

function useDashboardState(file: string, intervalMs: number): DashboardState {
  const [state, setState] = useState<DashboardState>(() => aggregate(readEventsFile(file)));
  useEffect(() => {
    const timer = setInterval(() => setState(aggregate(readEventsFile(file))), intervalMs);
    return () => clearInterval(timer);
  }, [file, intervalMs]);
  return state;
}

export function Dashboard({ state, file, intervalMs = 300 }: { state?: DashboardState; file: string; intervalMs?: number }): React.ReactElement {
  const { exit } = useApp();
  const live = useDashboardState(file, intervalMs);
  const current = state ?? live;
  const stageOrder = ["planner", "build", "review", "fix", "break", "verify"];

  useEffect(() => {
    if (current.finished) {
      const timer = setTimeout(() => exit(current.accepted ? 0 : 1), 600);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [current.finished, current.accepted, exit]);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text bold color="cyan">GUILDLESS WATCH</Text>
      <Text dimColor>{current.runId ?? "waiting for events…"}</Text>
      {current.objective ? <Text wrap="truncate">{current.objective.slice(0, 100)}</Text> : null}

      <Box marginTop={1}>
        {stageOrder.map((stage) => (
          <Box key={stage} marginRight={3}>
            <Text color={stageColor(current.stages[stage] ?? "pending")}>
              {`${stage} ${stageIcon(current.stages[stage] ?? "pending")}`}
            </Text>
          </Box>
        ))}
      </Box>

      {current.agents.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Agents</Text>
          {current.agents.map((agent) => (
            <Text key={agent.id} color={agent.status === "done" ? "green" : agent.status === "failed" ? "red" : "cyan"}>
              {`  ${agent.status === "done" ? "✓" : agent.status === "failed" ? "✗" : "…"} ${agent.id.padEnd(14)} ${(agent.inputTokens + agent.outputTokens).toLocaleString()} tokens`}
            </Text>
          ))}
        </Box>
      ) : null}

      {Object.entries(current.progress)
        .filter(([, p]) => p.total > 0)
        .map(([what, p]) => (
          <Box key={what} marginTop={1}>
            <Text dimColor>{what}: </Text>
            <Bar done={p.done} total={p.total} />
          </Box>
        ))}

      {current.verify.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Verify</Text>
          {current.verify.slice(-8).map((v, index) => (
            <Text key={`${v.label}-${index}`} color={v.ok ? "green" : "red"}>{`  ${v.ok ? "✓" : "✗"} ${v.label}`}</Text>
          ))}
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1}>
        <Text>{`Human interventions: ${current.humanInterventions}`}</Text>
        <Text>{`Runtime: ${formatElapsed(current.elapsedMs)}`}</Text>
        <Text>{`Tokens: ${current.tokens.toLocaleString()}`}</Text>
        <Text>{`Cost: $${current.cost.toFixed(4)}`}</Text>
      </Box>

      <Text bold color={current.accepted ? "green" : current.verdict === "REJECTED" ? "red" : "yellow"}>
        {`Verdict: ${current.verdict ?? "running…"}`}
      </Text>
    </Box>
  );
}

export async function startDashboard(file: string, intervalMs: number): Promise<{ close: () => void; waitUntilExit: () => Promise<void> }> {
  const { waitUntilExit, unmount } = render(React.createElement(Dashboard, { file, intervalMs }));
  return { close: unmount, waitUntilExit: () => waitUntilExit().then(() => undefined) };
}
