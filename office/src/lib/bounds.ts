/**
 * Hard office bounds derived from the office-map.glb AABB
 * (min -10.09/-1.18, max 10.05/10.11) with a 0.5m safe inset.
 * Agents must never leave this rectangle.
 */

export const OFFICE_BOUNDS = {
  minX: -9.59,
  maxX: 9.55,
  minZ: -0.68,
  maxZ: 9.61
} as const;

export const ROOM_FALLBACK = { x: 0, z: 4.5 };

export interface XZ {
  x: number;
  z: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isFinitePoint(p: XZ): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.z);
}

export function isInsideOffice(p: XZ): boolean {
  if (!isFinitePoint(p)) return false;
  return (
    p.x >= OFFICE_BOUNDS.minX && p.x <= OFFICE_BOUNDS.maxX &&
    p.z >= OFFICE_BOUNDS.minZ && p.z <= OFFICE_BOUNDS.maxZ
  );
}

/** Clamp a point inside the safe office bounds. Non-finite points fall back to the room center. */
export function clampToSafe(p: XZ): XZ {
  if (!isFinitePoint(p)) return { ...ROOM_FALLBACK };
  return {
    x: clamp(p.x, OFFICE_BOUNDS.minX, OFFICE_BOUNDS.maxX),
    z: clamp(p.z, OFFICE_BOUNDS.minZ, OFFICE_BOUNDS.maxZ)
  };
}
