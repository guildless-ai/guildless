import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export interface HttpTarget {
  url: string;
  status: number;
  timeoutMs?: number;
}

export interface GuildlessContract {
  testedCommit: string;
  commands: string[];
  urls: HttpTarget[];
  unverifiedScope: string[];
}

function strings(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${key} must be a non-empty string array`);
  }
  return value;
}

export async function loadContract(file: string): Promise<GuildlessContract> {
  const absolute = path.resolve(file);
  const raw = YAML.parse(await readFile(absolute, "utf8")) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") throw new Error("contract must be a YAML object");
  if (typeof raw.testedCommit !== "string" || raw.testedCommit.trim() === "") {
    throw new Error("testedCommit must be a commit SHA or ref");
  }
  if (!Array.isArray(raw.commands) || raw.commands.length === 0) {
    throw new Error("commands must contain at least one command");
  }
  if (!Array.isArray(raw.urls) || raw.urls.length === 0) {
    throw new Error("urls must contain at least one HTTP target");
  }

  const urls = raw.urls.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`urls[${index}] must be an object`);
    const target = item as Record<string, unknown>;
    if (typeof target.url !== "string" || !/^https?:\/\//.test(target.url)) {
      throw new Error(`urls[${index}].url must use http or https`);
    }
    if (!Number.isInteger(target.status) || (target.status as number) < 100 || (target.status as number) > 599) {
      throw new Error(`urls[${index}].status must be an HTTP status code`);
    }
    if (target.timeoutMs !== undefined && (!Number.isInteger(target.timeoutMs) || (target.timeoutMs as number) <= 0)) {
      throw new Error(`urls[${index}].timeoutMs must be a positive integer`);
    }
    return target as unknown as HttpTarget;
  });

  return {
    testedCommit: raw.testedCommit,
    commands: strings(raw.commands, "commands"),
    urls,
    unverifiedScope: strings(raw.unverifiedScope, "unverifiedScope")
  };
}
