import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readInput, writeOutput } from "./agent-io.js";

interface TaskInput { id: string; file?: string; }

const input = readInput();
const tasks = Array.isArray(input.tasks) ? (input.tasks as TaskInput[]) : [];
const artifacts: string[] = [];
for (const task of tasks) {
  const file = task.file ?? `src/${task.id}.ts`;
  let name = path.basename(file).replace(/\.ts$/, "").replace(/[^a-zA-Z0-9]/g, "_");
  if (!/^[A-Za-z_$]/.test(name)) name = `m_${name}`;
  const code = `export function ${name}(): number {\n  return ${name.length};\n}\n`;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, code, "utf8");
  artifacts.push(file);
}
writeOutput({ status: "ok", artifacts, summary: `built ${artifacts.length} modules` });
