import { describe, expect, it } from "vitest";
import { isNarrow, MIN_FONT, NARROW_BREAKPOINT, PANEL_WIDTH } from "../src/lib/ui";

describe("responsive layout", () => {
  it("gives the 3D map the majority (~60%) by using narrow 20% side panels and a 15px min font", () => {
    expect(PANEL_WIDTH).toBe("20%");
    expect(MIN_FONT).toBe(15);
  });

  it("collapses side panels to drawers on narrow viewports", () => {
    expect(isNarrow(NARROW_BREAKPOINT - 1)).toBe(true);
    expect(isNarrow(NARROW_BREAKPOINT)).toBe(false);
    expect(isNarrow(1440)).toBe(false);
    expect(isNarrow(1920)).toBe(false);
  });
});
