import { describe, expect, it } from "vitest";
import { buildReplaySchedule, speedForDuration } from "../src/lib/replay";
import type { GuildlessEvent } from "../src/lib/mapping";

function ev(ts: string): GuildlessEvent {
  return { type: "agent_start", role: "builder", id: "b", runId: "run-1", ts };
}

describe("buildReplaySchedule", () => {
  it("preserves event order even when stored out of order", () => {
    const schedule = buildReplaySchedule(
      [ev("2026-08-02T00:00:05.000Z"), ev("2026-08-02T00:00:00.000Z"), ev("2026-08-02T00:00:10.000Z")],
      "run-1",
      1
    );
    expect(schedule.events).toBe(3);
    const actions = schedule.schedule.map((item) => item.atMs);
    expect(actions).toEqual([0, 5000, 10000]);
  });

  it("compresses real gaps by speed and never invents events", () => {
    const schedule = buildReplaySchedule(
      [
        ev("2026-08-02T00:00:00.000Z"),
        ev("2026-08-02T00:00:10.000Z"),
        ev("2026-08-02T00:00:20.000Z")
      ],
      "run-1",
      10
    );
    expect(schedule.durationMs).toBe(2000);
    expect(schedule.schedule.length).toBe(3);
    expect(schedule.schedule.map((item) => item.atMs)).toEqual([0, 1000, 2000]);
  });

  it("filters to a single real run", () => {
    const other = { ...ev("2026-08-02T00:00:01.000Z"), runId: "run-2" };
    const schedule = buildReplaySchedule([ev("2026-08-02T00:00:00.000Z"), other], "run-1", 1);
    expect(schedule.events).toBe(1);
  });
});

describe("speedForDuration", () => {
  it("scales speed so a real run compresses to the target duration", () => {
    const events = [
      ev("2026-08-02T00:00:00.000Z"),
      ev("2026-08-02T00:00:30.000Z"),
      ev("2026-08-02T00:01:00.000Z")
    ];
    expect(speedForDuration(events, "run-1", 15_000)).toBe(4); // 60s / 15s
  });
});
