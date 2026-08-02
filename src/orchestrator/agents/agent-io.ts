import { readFileSync, writeFileSync } from "node:fs";

export function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function readInput(): Record<string, unknown> {
  const file = arg("input");
  if (!file) throw new Error("missing --input");
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

export function writeOutput(value: unknown): void {
  const file = arg("output");
  if (!file) throw new Error("missing --output");
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
