import { describe, expect, it } from "vitest";
import { CHARACTERS, CHARACTER_ORDER, roleToCharacter, ZONE_LABELS, ZONE_NAV, ZONE_ORDER } from "../src/lib/zones";
import { OFFICE_BOUNDS } from "../src/lib/bounds";

describe("workstation navigation", () => {
  it("defines approach, chair, look target and a Desk View camera for every zone", () => {
    expect(ZONE_ORDER.length).toBe(6);
    for (const zone of ZONE_ORDER) {
      const nav = ZONE_NAV[zone];
      for (const field of ["approachPosition", "chairPosition", "lookTarget", "cameraPosition", "cameraTarget"] as const) {
        for (const component of nav[field]) expect(Number.isFinite(component)).toBe(true);
      }
      expect(nav.chairPosition[1]).toBe(0);
      // Desk View camera must stay inside OFFICE_BOUNDS
      expect(nav.cameraPosition[0]).toBeGreaterThanOrEqual(OFFICE_BOUNDS.minX);
      expect(nav.cameraPosition[0]).toBeLessThanOrEqual(OFFICE_BOUNDS.maxX);
      expect(nav.cameraPosition[2]).toBeGreaterThanOrEqual(OFFICE_BOUNDS.minZ);
      expect(nav.cameraPosition[2]).toBeLessThanOrEqual(OFFICE_BOUNDS.maxZ);
    }
    expect(Object.keys(ZONE_LABELS).length).toBe(6);
  });
});

describe("character config", () => {
  it("defines the three visible characters with a home zone", () => {
    expect(CHARACTER_ORDER).toEqual(["director", "engineer", "reviewer"]);
    for (const id of CHARACTER_ORDER) {
      expect(CHARACTERS[id].model).toMatch(/\.glb$/);
      expect(CHARACTERS[id].homeZone).toBeTruthy();
    }
    expect(CHARACTERS.reviewer.walkUsesClip).toBe(false);
  });

  it("maps roles to characters", () => {
    expect(roleToCharacter("planner")).toBe("director");
    expect(roleToCharacter("builder")).toBe("engineer");
    expect(roleToCharacter("reviewer")).toBe("reviewer");
  });
});
