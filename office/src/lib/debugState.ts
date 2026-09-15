import type { CameraMode, CharacterId } from "./zones";

export interface DebugAgent {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  targetZone: string | null;
  velocity: number;
  atWorkstation: boolean;
}

export interface DebugState {
  agents: Record<CharacterId, DebugAgent>;
  camera: {
    mode: CameraMode;
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
  activeEvent: string | null;
  verdictAnimationCount: number;
  visibleLabelCount: number;
  officeBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  debugOn: boolean;
}

export const debugState: DebugState = {
  agents: {
    director: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, targetZone: null, velocity: 0, atWorkstation: false },
    engineer: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, targetZone: null, velocity: 0, atWorkstation: false },
    reviewer: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, targetZone: null, velocity: 0, atWorkstation: false }
  },
  camera: { mode: "god", position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
  activeEvent: null,
  verdictAnimationCount: 0,
  visibleLabelCount: 0,
  officeBounds: { minX: -9.59, maxX: 9.55, minZ: -0.68, maxZ: 9.61 },
  debugOn: false
};

export function readDebug(): DebugState {
  return debugState;
}
