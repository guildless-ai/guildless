/**
 * GUILDLESS office zones + characters + camera — single configuration file.
 *
 * Workstation navigation uses the REAL chair node world positions extracted
 * from office-map.glb (OfficeChair_Modern.*). Each workstation defines:
 *   approachPosition — where the agent finishes its walk
 *   chairPosition    — the exact work spot (in front of the chair)
 *   lookTarget       — the monitor / desk the agent faces while working
 *
 * The agent flow is: walk → approachPosition → chairPosition → rotate toward
 * lookTarget → work. Agents never stand on desks.
 */

export type ZoneId =
  | "planning"
  | "engineering"
  | "review"
  | "testing"
  | "operations"
  | "breakroom";

export interface Workstation {
  approachPosition: [number, number, number];
  chairPosition: [number, number, number];
  lookTarget: [number, number, number];
  /** Desk View camera: behind the chair, ~1.6m high, ~2.5m behind, slightly right. Clamped inside OFFICE_BOUNDS. */
  cameraPosition: [number, number, number];
  /** Desk View target: the monitor center. */
  cameraTarget: [number, number, number];
}

export const ZONE_NAV: Record<ZoneId, Workstation> = {
  planning: {
    approachPosition: [-4.08, 0, 1.22],
    chairPosition: [-5.02, 0, 0.46],
    lookTarget: [-4.58, 0, 0.79],
    cameraPosition: [-0.5, 6.5, 0.7],
    cameraTarget: [-4.6, 0.4, 0.6]
  },
  engineering: {
    approachPosition: [-4.11, 0, 3.61],
    chairPosition: [-5.29, 0, 3.37],
    lookTarget: [-4.62, 0, 3.61],
    cameraPosition: [-0.6, 6.5, 3.4],
    cameraTarget: [-5.0, 0.4, 3.5]
  },
  review: {
    approachPosition: [-5.23, 0, 4.04],
    chairPosition: [-6.43, 0, 3.94],
    lookTarget: [-7.03, 0, 3.61],
    cameraPosition: [-1.4, 6.5, 3.9],
    cameraTarget: [-6.0, 0.4, 3.9]
  },
  testing: {
    approachPosition: [-7.27, 0, 0.9],
    chairPosition: [-8.35, 0, 0.37],
    lookTarget: [-8.57, 0, 0.84],
    cameraPosition: [-3.2, 6.5, 0.7],
    cameraTarget: [-7.9, 0.4, 0.6]
  },
  operations: {
    approachPosition: [-6.25, 0, 4.96],
    chairPosition: [-7.45, 0, 5.06],
    lookTarget: [-7.28, 0, 4.64],
    cameraPosition: [-2.3, 6.5, 4.9],
    cameraTarget: [-7.0, 0.4, 5.0]
  },
  breakroom: {
    approachPosition: [0.35, 0, 4.28],
    chairPosition: [-0.71, 0, 4.85],
    lookTarget: [0, 0, 5],
    cameraPosition: [2.6, 6.5, 4.3],
    cameraTarget: [-0.8, 0.4, 4.9]
  }
};

export const ZONE_LABELS: Record<ZoneId, string> = {
  planning: "Planning",
  engineering: "Engineering",
  review: "Review",
  testing: "Testing",
  operations: "Operations",
  breakroom: "Break room"
};

export const ZONE_MARKERS: Partial<Record<ZoneId, string>> = {};
export const ZONE_ORDER: ZoneId[] = ["planning", "engineering", "review", "testing", "operations", "breakroom"];

/** Central aisle waypoint so agents do not clip desks/furniture. */
export const WAYPOINT: [number, number, number] = [0, 0, 5];
/** Coffee spot for idle employees. */
export const COFFEE_SPOT: [number, number, number] = [1.6, 0, 6.5];

export const WALK_SPEED = 3;
export const ARRIVAL_EPSILON = 0.1;

export const ROOM_CENTER: [number, number, number] = [0, 0.5, 4.47];

export type CharacterId = "director" | "engineer" | "reviewer";

export interface CharacterSpec {
  id: CharacterId;
  model: string;
  displayName: string;
  roles: string[];
  scale: number;
  yOffset: number;
  accent: string;
  walkUsesClip: boolean;
  idleClip: string | null;
  homeZone: ZoneId;
}

export const CHARACTERS: Record<CharacterId, CharacterSpec> = {
  director: {
    id: "director",
    model: "/models/animal_crossing_character.glb",
    displayName: "Director",
    roles: ["planner", "director", "deploy", "monitor", "operator"],
    scale: 0.66,
    yOffset: 0,
    accent: "#7c5cff",
    walkUsesClip: true,
    idleClip: null,
    homeZone: "planning"
  },
  engineer: {
    id: "engineer",
    model: "/models/herobrine_-_minecraft.glb",
    displayName: "Engineer",
    roles: ["builder", "breaker", "fixer", "verifier"],
    scale: 0.21,
    yOffset: 0,
    accent: "#22c55e",
    walkUsesClip: true,
    idleClip: null,
    homeZone: "engineering"
  },
  reviewer: {
    id: "reviewer",
    model: "/models/haniwa.glb",
    displayName: "Reviewer",
    roles: ["reviewer"],
    scale: 0.62,
    yOffset: 0.62,
    accent: "#f59e0b",
    walkUsesClip: false,
    idleClip: "Animation",
    homeZone: "review"
  }
};

export const CHARACTER_ORDER: CharacterId[] = ["director", "engineer", "reviewer"];

export function roleToCharacter(role: string): CharacterId {
  for (const id of CHARACTER_ORDER) {
    if (CHARACTERS[id].roles.includes(role)) return id;
  }
  return "director";
}

export const MAP_URL = "/maps/office-map.glb";

export type CameraMode = "god" | "orbit" | "desk";

export const CAMERA = {
  /** Elevated isometric, close enough to inspect characters and desks. */
  godViewPosition: [9.5, 14, 11.5] as [number, number, number],
  godViewTarget: [0, 0.5, 4.5] as [number, number, number],
  tweenDurationMs: 900,
  targetBounds: { minX: -9, maxX: 9, minZ: -0.8, maxZ: 9.5, minY: 0, maxY: 3 },
  /** Camera x/z must stay inside the office-map footprint (AABB -10.09..10.05, -1.18..10.11). */
  positionBounds: { minX: -10.5, maxX: 10.5, minZ: -1.5, maxZ: 10.5, minY: 1.5, maxY: 16 },
  minDistance: 2,
  maxDistance: 18,
  minPolarAngle: 0.1,
  maxPolarAngle: Math.PI / 2 - 0.05
} as const;
