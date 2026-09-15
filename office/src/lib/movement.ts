import { ARRIVAL_EPSILON } from "./zones";
import { clampToSafe, type XZ } from "./bounds";

export type MoveState = "IDLE" | "MOVING" | "WORKING";

export interface Point2D {
  x: number;
  z: number;
}

export interface Nav2D {
  approach: Point2D;
  chair: Point2D;
}

export interface MovementState {
  state: MoveState;
  route: Point2D[];
  routeIndex: number;
  lastZone: string | null;
  position: Point2D;
  workAt: Point2D | null;
}

export function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function buildRoute(from: Point2D, approach: Point2D, chair: Point2D, waypoint: Point2D): Point2D[] {
  const segments: Point2D[] = [];
  const via = clampToSafe(waypoint as XZ);
  const appr = clampToSafe(approach as XZ);
  const chairP = clampToSafe(chair as XZ);
  if (dist(from, appr) > 1.2 && dist(from, via) > 1.0 && dist(appr, via) > 1.0) {
    segments.push(via);
  }
  segments.push(appr);
  segments.push(chairP);
  return segments;
}

/**
 * Deterministic movement state machine:
 *   IDLE → MOVING → WORKING
 * The route is rebuilt ONLY when the target zone changes. Once WORKING the
 * machine is terminal (no oscillation). Arrival snaps exactly to the chair.
 */
export function stepMovement(
  current: MovementState,
  zone: string | null,
  nav: Nav2D,
  waypoint: Point2D,
  maxStep: number,
  epsilon = ARRIVAL_EPSILON
): MovementState {
  if (zone !== current.lastZone) {
    const approach: Point2D = { x: nav.approach.x, z: nav.approach.z };
    const chair: Point2D = { x: nav.chair.x, z: nav.chair.z };
    return {
      state: "MOVING",
      route: buildRoute(current.position, approach, chair, waypoint),
      routeIndex: 0,
      lastZone: zone,
      position: { ...current.position },
      workAt: chair
    };
  }

  if (current.state !== "MOVING") return current;

  const goal = current.route[current.routeIndex];
  if (!goal) return { ...current, state: "WORKING", position: current.workAt ? { ...current.workAt } : current.position };

  const distance = dist(current.position, goal);
  const position = clampToSafe({ ...current.position } as XZ);
  let routeIndex = current.routeIndex;

  if (distance <= epsilon) {
    routeIndex += 1;
    if (routeIndex >= current.route.length) {
      // Arrived at the chair: snap exactly once, never oscillate afterward.
      return {
        state: "WORKING",
        route: current.route,
        routeIndex,
        lastZone: current.lastZone,
        position: current.workAt ? clampToSafe({ ...current.workAt } as XZ) : position,
        workAt: current.workAt
      };
    }
  } else {
    const step = Math.min(maxStep, distance);
    position.x += ((goal.x - position.x) / distance) * step;
    position.z += ((goal.z - position.z) / distance) * step;
  }

  return { state: "MOVING", route: current.route, routeIndex, lastZone: current.lastZone, position: clampToSafe(position), workAt: current.workAt };
}

export function initMovement(zone: string, nav: Nav2D): MovementState {
  return {
    state: "WORKING",
    route: [],
    routeIndex: 0,
    lastZone: zone,
    position: { x: nav.chair.x, z: nav.chair.z },
    workAt: { x: nav.chair.x, z: nav.chair.z }
  };
}
