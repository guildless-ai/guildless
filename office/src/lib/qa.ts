export interface Assertion {
  id: string;
  ok: boolean;
  detail?: string;
}

export type Severity = "critical" | "high" | "medium" | "low";

export interface Finding {
  id: string;
  severity: Severity;
  observed: string;
  expected: string;
  evidence: string[];
  owner: string;
  status: "open" | "fixed" | "verified";
}

export interface DebugStateLike {
  agents: Record<string, { position: { x: number; y: number; z: number }; targetZone: string | null; velocity: number; atWorkstation: boolean }>;
  camera: { mode: string; position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } };
  activeEvent: string | null;
  verdictAnimationCount: number;
  visibleLabelCount: number;
  officeBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  debugOn: boolean;
}

const CAMERA_POS = { minX: -10.5, maxX: 10.5, minZ: -1.5, maxZ: 10.5, minY: 1.5, maxY: 16 };
const CAMERA_TARGET = { minX: -9, maxX: 9, minZ: -0.8, maxZ: 9.5, minY: 0, maxY: 3 };

/** Machine assertions over the real runtime debug state. */
export function assertDebugState(debug: DebugStateLike | null): Assertion[] {
  if (!debug) return [{ id: "debug.state", ok: false, detail: "window.__GUILDLESS_DEBUG__ is not exposed" }];
  const out: Assertion[] = [];
  const b = debug.officeBounds;

  for (const [name, agent] of Object.entries(debug.agents)) {
    const p = agent.position;
    const inside = p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
    out.push({ id: `agent.${name}.inside`, ok: inside, detail: inside ? undefined : `agent ${name} at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) outside bounds` });
    const yOk = p.y >= -0.3 && p.y <= 4.5;
    out.push({ id: `agent.${name}.y`, ok: yOk, detail: yOk ? undefined : `agent ${name} y=${p.y.toFixed(2)} out of floor/ceiling range` });
    if (agent.atWorkstation) {
      const calm = agent.velocity < 1.5;
      out.push({ id: `agent.${name}.stable`, ok: calm, detail: calm ? undefined : `agent ${name} velocity=${agent.velocity.toFixed(2)} at workstation` });
    }
  }

  const c = debug.camera;
  const camInside = c.position.x >= CAMERA_POS.minX && c.position.x <= CAMERA_POS.maxX && c.position.z >= CAMERA_POS.minZ && c.position.z <= CAMERA_POS.maxZ;
  out.push({ id: "camera.inside", ok: camInside, detail: camInside ? undefined : `camera at (${c.position.x.toFixed(2)}, ${c.position.z.toFixed(2)}) outside bounds` });
  const tgtInside = c.target.x >= CAMERA_TARGET.minX && c.target.x <= CAMERA_TARGET.maxX && c.target.z >= CAMERA_TARGET.minZ && c.target.z <= CAMERA_TARGET.maxZ;
  out.push({ id: "camera.target.inside", ok: tgtInside, detail: tgtInside ? undefined : `camera target at (${c.target.x.toFixed(2)}, ${c.target.z.toFixed(2)}) outside bounds` });

  out.push({ id: "verdict.animation.le1", ok: debug.verdictAnimationCount <= 1, detail: `count=${debug.verdictAnimationCount}` });
  out.push({ id: "labels.single", ok: debug.visibleLabelCount === 3, detail: `visible labels=${debug.visibleLabelCount}` });
  return out;
}

export interface LayoutSample {
  width: number;
  height: number;
  panels: Array<{ x: number; y: number; width: number; height: number }>;
  fonts: number[];
}

/** Layout / readability assertions over DOM measurements. */
export function assertLayout(sample: LayoutSample): Assertion[] {
  const out: Assertion[] = [];
  for (let i = 0; i < sample.panels.length; i += 1) {
    const p = sample.panels[i];
    const inside = p.x >= 0 && p.y >= 0 && p.x + p.width <= sample.width + 1 && p.y + p.height <= sample.height + 1;
    out.push({ id: `panel.${i}.viewport`, ok: inside, detail: inside ? undefined : `panel ${i} bbox out of viewport` });
  }
  const minFont = Math.min(...sample.fonts, 99);
  out.push({ id: "text.readable", ok: minFont >= 13, detail: `min font=${minFont}px` });
  return out;
}

export function assertionsToFindings(assertions: Assertion[], evidence: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const a of assertions) {
    if (a.ok) continue;
    const critical = a.id.includes("inside") || a.id.includes("outside") || a.id.includes("y") || a.id.includes("animation");
    findings.push({
      id: `qa-${a.id.replace(/\./g, "-")}`,
      severity: critical ? "critical" : "high",
      observed: a.detail ?? a.id,
      expected: "machine assertion passes",
      evidence,
      owner: "visual-qa",
      status: "open"
    });
  }
  return findings;
}
