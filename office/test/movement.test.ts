import { describe, expect, it } from "vitest";
import { initMovement, stepMovement, type MovementState } from "../src/lib/movement";

const nav = {
  approach: { x: -4.08, z: 1.22 },
  chair: { x: -5.02, z: 0.46 }
};
const waypoint = { x: 0, z: 5 };
const EPS = 0.1;

function runToArrival(m: MovementState, zone: string, maxStep = 0.3): MovementState {
  let steps = 0;
  while (m.state !== "WORKING" && steps < 2000) {
    m = stepMovement(m, zone, nav, waypoint, maxStep);
    steps += 1;
  }
  return m;
}

describe("movement state machine", () => {
  it("walks to the chair and stops stably without oscillation", () => {
    const arrived = runToArrival(initMovement("planning", nav), "planning");
    expect(arrived.state).toBe("WORKING");
    expect(Math.abs(arrived.position.x - nav.chair.x)).toBeLessThanOrEqual(EPS);
    expect(Math.abs(arrived.position.z - nav.chair.z)).toBeLessThanOrEqual(EPS);

    const before = { ...arrived.position };
    let stable = arrived;
    for (let i = 0; i < 20; i += 1) stable = stepMovement(stable, "planning", nav, waypoint, 0.3);
    expect(stable.position.x).toBe(before.x);
    expect(stable.position.z).toBe(before.z);
    expect(stable.state).toBe("WORKING");
  });

  it("clamps overshoot to the goal", () => {
    let m: MovementState = {
      state: "MOVING",
      route: [{ x: 0, z: 0 }, { x: 5, z: 0 }],
      routeIndex: 0,
      lastZone: "planning",
      position: { x: 0, z: 0 },
      workAt: { x: 5, z: 0 }
    };
    m = stepMovement(m, "planning", nav, waypoint, 10);
    expect(m.position.x).toBeLessThanOrEqual(5);
    expect(m.state).toBe("MOVING");
  });

  it("only rebuilds the route when the target zone changes", () => {
    const start = initMovement("planning", nav);
    const a = stepMovement(start, "planning", nav, waypoint, 0.3);
    const b = stepMovement(a, "planning", nav, waypoint, 0.3);
    expect(b.route).toBe(a.route); // same route reference while zone is unchanged

    const c = stepMovement(b, "engineering", nav, waypoint, 0.3);
    expect(c.route).not.toBe(b.route); // new route for a new zone
    expect(c.lastZone).toBe("engineering");
  });

  it("arrives exactly at the chair once, then stays WORKING", () => {
    let m = initMovement("planning", nav);
    m = { ...m, state: "MOVING", route: [{ x: nav.chair.x, z: nav.chair.z }], routeIndex: 0, position: { x: nav.chair.x + 0.05, z: nav.chair.z + 0.05 } };
    const arrived = stepMovement(m, "planning", nav, waypoint, 0.3);
    expect(arrived.state).toBe("WORKING");
    expect(arrived.position.x).toBe(nav.chair.x);
    expect(arrived.position.z).toBe(nav.chair.z);
  });

  it("clamps out-of-bounds targets so the agent never leaves the office map", () => {
    const badNav = { approach: { x: 500, z: 500 }, chair: { x: 500, z: 500 } };
    let m = stepMovement(initMovement("planning", nav), "engineering", badNav, waypoint, 0.3);
    let steps = 0;
    while (m.state !== "WORKING" && steps < 2000) {
      m = stepMovement(m, "engineering", badNav, waypoint, 0.3);
      steps += 1;
    }
    expect(m.state).toBe("WORKING");
    expect(m.position.x).toBeLessThanOrEqual(9.55);
    expect(m.position.z).toBeLessThanOrEqual(9.61);
    expect(m.position.x).toBeGreaterThanOrEqual(-9.59);
    expect(m.position.z).toBeGreaterThanOrEqual(-0.68);
  });
});
