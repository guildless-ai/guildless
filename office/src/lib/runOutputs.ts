import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const RUNS = path.resolve(process.cwd(), "..", ".guildless", "runs");

export function sanitizeRunId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "");
}

export function runDir(id: string): string {
  return path.join(RUNS, sanitizeRunId(id));
}

export async function readJson<T>(id: string, file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(runDir(id), file), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function readText(id: string, file: string): Promise<string | null> {
  try {
    return await readFile(path.join(runDir(id), file), "utf8");
  } catch {
    return null;
  }
}

export async function listRunFiles(id: string): Promise<string[]> {
  try {
    return await readdir(runDir(id), { recursive: true }) as string[];
  } catch {
    return [];
  }
}
