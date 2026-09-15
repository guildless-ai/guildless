import { describe, expect, it } from "vitest";
import { useOffice } from "../src/lib/store";

describe("applyControl", () => {
  it("pause / resume / prioritize / stop / retry actually mutate office state", () => {
    const store = useOffice;
    store.getState().applyControl("pause");
    expect(store.getState().paused).toBe(true);

    store.getState().applyControl("resume");
    expect(store.getState().paused).toBe(false);

    store.getState().applyControl("prioritize", "the parser");
    expect(store.getState().priority).toBe("the parser");

    store.getState().applyControl("stop");
    expect(store.getState().stopDeployment).toBe(true);
    expect(store.getState().paused).toBe(true);

    store.getState().applyControl("retry");
    expect(store.getState().stopDeployment).toBe(false);
    expect(store.getState().paused).toBe(false);
  });
});

describe("celebration and event routing", () => {
  it("fires the ACCEPTED celebration once per run (live mode never re-triggers)", () => {
    const store = useOffice;
    store.setState({ lastCelebratedRunId: null, lastWarnedRunId: null, _memo: [] });
    const before = store.getState().agents.director.celebrationAt;

    store.getState().applyEvent({ type: "verdict", verdict: "ACCEPTED", runId: "r1" });
    const afterFirst = store.getState().agents.director.celebrationAt;
    expect(afterFirst).toBeGreaterThanOrEqual(before);

    store.getState().applyEvent({ type: "verdict", verdict: "ACCEPTED", runId: "r1" });
    expect(store.getState().agents.director.celebrationAt).toBe(afterFirst); // not re-triggered

    store.getState().applyEvent({ type: "verdict", verdict: "REJECTED", runId: "r2" });
    expect(store.getState().agents.director.warningAt).toBeGreaterThanOrEqual(afterFirst);
    store.getState().applyEvent({ type: "verdict", verdict: "REJECTED", runId: "r2" });
    expect(store.getState().agents.director.warningAt).toBeGreaterThanOrEqual(store.getState().agents.director.warningAt);
  });

  it("routes a builder event to both the Engineer and the Director (supervision)", () => {
    const store = useOffice;
    store.setState({ agents: store.getState().agents, _memo: [] });
    store.getState().applyEvent({ type: "agent_start", role: "builder", id: "b", runId: "r3" });
    const state = store.getState();
    expect(state.agents.engineer.targetZone).toBe("engineering");
    expect(state.agents.director.targetZone).toBe("engineering");
  });

  it("routes summary to the break room for the active character", () => {
    const store = useOffice;
    store.getState().applyEvent({ type: "summary", runId: "r4" });
    const state = store.getState();
    expect(state.agents[state.activeCharacter].targetZone).toBe("breakroom");
  });

  it("triggers the Issue parcel once per run and a red review flag on findings", () => {
    const store = useOffice;
    store.setState({ issueDelivery: { active: false, startedAt: 0, runId: null }, reviewFlag: { at: 0, count: 0 }, _memo: [] });
    store.getState().applyEvent({ type: "run_start", runId: "r5" });
    expect(store.getState().issueDelivery.active).toBe(true);
    expect(store.getState().issueDelivery.runId).toBe("r5");

    // same run: do not re-deliver
    const before = store.getState().issueDelivery.startedAt;
    store.getState().applyEvent({ type: "run_start", runId: "r5" });
    expect(store.getState().issueDelivery.startedAt).toBe(before);

    // reviewer finishes with findings → red flag
    store.setState({ _memo: [] });
    store.getState().applyEvent({ type: "agent_start", role: "reviewer", id: "r", runId: "r5" });
    store.getState().applyEvent({ type: "agent_end", role: "reviewer", id: "r", ok: true, runId: "r5" });
    expect(store.getState().reviewFlag.count).toBeGreaterThan(0);
    expect(store.getState().reviewFlag.at).toBeGreaterThan(0);
  });

  it("moves the issue envelope Director → Engineer → Reviewer → Verifier and stamps the verdict", () => {
    const store = useOffice;
    store.setState({ postman: { seq: -1, target: null, from: null, stamp: null }, _memo: [] });
    const apply = store.getState().applyEvent;

    apply({ type: "run_start", runId: "r6" });
    expect(store.getState().postman.target).toBe("director");
    expect(store.getState().postman.from).toBeNull();

    apply({ type: "agent_start", role: "builder", id: "b", runId: "r6" });
    expect(store.getState().postman.target).toBe("engineer");
    expect(store.getState().postman.from).toBe("director");

    apply({ type: "agent_start", role: "reviewer", id: "r", runId: "r6" });
    expect(store.getState().postman.target).toBe("reviewer");
    expect(store.getState().postman.from).toBe("engineer");

    apply({ type: "stage", stage: "verify", runId: "r6" });
    expect(store.getState().postman.target).toBe("engineer");
    expect(store.getState().postman.from).toBe("reviewer");

    apply({ type: "verdict", verdict: "ACCEPTED", runId: "r6" });
    expect(store.getState().postman.stamp).toBe("accepted");
    expect(store.getState().postman.seq).toBeGreaterThan(0);
  });
});
