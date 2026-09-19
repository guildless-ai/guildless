export const PANEL_WIDTH = "20%";
export const BOTTOM_BAR_HEIGHT = 84;
export const NARROW_BREAKPOINT = 1200;
export const MIN_FONT = 15;

export const COLORS = {
  planning: "#7c5cff",
  engineering: "#22c55e",
  review: "#f59e0b",
  verify: "#22d3ee",
  accepted: "#22c55e",
  rejected: "#ef4444"
} as const;

export function isNarrow(width: number): boolean {
  return width < NARROW_BREAKPOINT;
}

export const panelBase: React.CSSProperties = {
  width: "100%",
  minWidth: 240,
  background: "#0b1220",
  borderRight: "1px solid #1e293b",
  overflowY: "auto",
  padding: 14,
  fontSize: 14,
  lineHeight: 1.5,
  color: "#e2e8f0",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  boxSizing: "border-box"
};
