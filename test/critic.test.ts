import test from "node:test";
import assert from "node:assert/strict";
import { parseCritique, SEMANTIC_DIMENSIONS, PIXEL_DIMENSIONS, pixelModelConfigured, agentAvailable } from "../src/vision/critic.js";

test("parseCritique extracts scores, issues, and verdict for the semantic dimensions", () => {
  const raw = `notes
{"scores": {"goal": 80, "now": 55, "why": 40, "output": 30, "result": 60, "coherence": 20, "plainLanguage": 45, "destination": 25}, "issues": [{"severity": "critical", "dimension": "destination", "observed": "no output link visible", "expected": "a clear destination", "location": "right panel"}], "summary": "jargon everywhere"} `;
  const critique = parseCritique(raw, "semantic:deepseek", ["ui-evidence.txt"], SEMANTIC_DIMENSIONS);
  assert.ok(critique);
  assert.equal(critique.scores.goal, 80);
  assert.equal(critique.scores.coherence, 20);
  assert.equal(critique.verdict, "fix");
  assert.equal(critique.issues.length, 1);
  assert.equal(critique.issues[0].severity, "critical");
  assert.equal(critique.model, "semantic:deepseek");
});

test("parseCritique extracts the pixel dimensions", () => {
  const raw = `{"scores": {"hero": 70, "priority": 60, "camera": 50, "scale": 65, "legibility": 80, "overlap": 55, "whitespace": 40, "composition": 60, "polish": 45, "working": 35}, "issues": [], "summary": "ok", "verdict": "fix"}`;
  const critique = parseCritique(raw, "pixel:gpt-5.6-luna", ["god-1920x1080.png"], PIXEL_DIMENSIONS);
  assert.ok(critique);
  assert.equal(critique.scores.working, 35);
  assert.equal(critique.scores.legibility, 80);
  assert.equal(critique.verdict, "fix");
  assert.deepEqual(critique.screenshots, ["god-1920x1080.png"]);
});

test("parseCritique returns null on garbage", () => {
  assert.equal(parseCritique("no json here", "m", ["a.png"], SEMANTIC_DIMENSIONS), null);
});

test("parseCritique marks pass when scores are high", () => {
  const raw = `{"scores": {"goal": 90, "now": 88, "why": 85, "output": 86, "result": 82, "coherence": 90, "plainLanguage": 88, "destination": 84}, "issues": [], "summary": "solid", "verdict": "pass"}`;
  const critique = parseCritique(raw, "m", ["a.txt"], SEMANTIC_DIMENSIONS);
  assert.ok(critique);
  assert.equal(critique.verdict, "pass");
});

test("semantic and pixel dimensions are disjoint and complete", () => {
  const overlap = SEMANTIC_DIMENSIONS.filter((d) => PIXEL_DIMENSIONS.includes(d as never));
  assert.equal(overlap.length, 0);
  assert.equal(SEMANTIC_DIMENSIONS.length, 8);
  assert.equal(PIXEL_DIMENSIONS.length, 10);
});

test("pixelModelConfigured reflects the opencode CLI and the disable flag", () => {
  const previous = process.env.GUILDLESS_PIXEL_DISABLED;
  delete process.env.GUILDLESS_PIXEL_DISABLED;
  assert.equal(pixelModelConfigured(), agentAvailable());
  process.env.GUILDLESS_PIXEL_DISABLED = "1";
  assert.equal(pixelModelConfigured(), false);
  if (previous === undefined) delete process.env.GUILDLESS_PIXEL_DISABLED;
  else process.env.GUILDLESS_PIXEL_DISABLED = previous;
});
