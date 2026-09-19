import { describe, expect, it } from "vitest";
import { handleCommand } from "../src/lib/control";

describe("handleCommand", () => {
  it("recognizes pause, resume, prioritize, stop, retry, and status", () => {
    expect(handleCommand("pause the run").action).toBe("pause");
    expect(handleCommand("resume").action).toBe("resume");
    expect(handleCommand("continue").action).toBe("resume");
    expect(handleCommand("prioritize the CSV validator").action).toBe("prioritize");
    expect(handleCommand("work on the login flow").action).toBe("prioritize");
    expect(handleCommand("stop deployment").action).toBe("stop");
    expect(handleCommand("retry").action).toBe("retry");
    expect(handleCommand("status").action).toBe("status");
  });

  it("returns an English subtitle response for each action", () => {
    expect(handleCommand("pause").response).toMatch(/paused/i);
    expect(handleCommand("resume").response).toMatch(/resumed/i);
    expect(handleCommand("stop deployment").response).toMatch(/stopped/i);
    expect(handleCommand("retry").response).toMatch(/retrying/i);
    const prioritize = handleCommand("prioritize the parser");
    expect(prioritize.response).toMatch(/parser/i);
    expect(prioritize.subject).toBe("the parser");
    expect(handleCommand("status").response).toMatch(/Planner/);
  });

  it("falls back to an echo for unknown commands", () => {
    const result = handleCommand("sing a song");
    expect(result.action).toBe("unknown");
    expect(result.response).toMatch(/sing a song/);
  });
});
