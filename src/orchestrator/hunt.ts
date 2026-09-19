import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type Difficulty = "easy" | "medium" | "hard";

export interface HuntedIssue {
  repo: string;
  issue: string;
  title: string;
  url: string;
  language: string;
  stars: number;
  labels: string[];
  difficulty: Difficulty;
}

const LABELS = ["good first issue", "help wanted", "bug", "enhancement"];

const HARD_RE = /refactor|migrat|architect|performance|benchmark|breaking change|integrat|large|distributed|securit|auth|database|graphql|rewrite|rework|async rework/i;
const EASY_RE = /typo|spelling|documentation|docs|error message|readme|add (unit )?tests?|coverage|cosmetic|format|prettier|comment|link|badge|simple|small|sample/i;

export function classifyDifficulty(title: string, labels: string[], stars: number): Difficulty {
  if (HARD_RE.test(title)) return "hard";
  if (EASY_RE.test(title)) return "easy";
  if (labels.some((label) => /good first|easy|low hanging|first-timers|up-for-grabs/i.test(label))) return "easy";
  if (stars < 150 && title.length < 70) return "easy";
  return "medium";
}

interface RawIssue {
  number: number;
  title: string;
  url: string;
  repository: { nameWithOwner: string };
  labels: Array<{ name: string }>;
}

async function searchLanguage(language: string, label: string, limit: number): Promise<RawIssue[]> {
  try {
    const { stdout } = await execFileAsync("gh", [
      "search", "issues", "--language", language, "--label", label,
      "--state", "open", "--sort", "updated", "--order", "desc",
      "--limit", String(limit), "--json", "number,title,url,repository,labels"
    ], { encoding: "utf8" });
    return JSON.parse(stdout) as RawIssue[];
  } catch {
    return [];
  }
}

async function repoStars(repo: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("gh", ["api", `repos/${repo}`, "--jq", ".stargazers_count"], { encoding: "utf8" });
    return Number.parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

export async function huntIssues(language: string, limit: number): Promise<HuntedIssue[]> {
  const perLabel = Math.max(1, Math.ceil(limit / LABELS.length));
  const raw: RawIssue[] = [];
  for (const label of LABELS) {
    raw.push(...await searchLanguage(language, label, perLabel));
  }
  const seen = new Set<string>();
  const unique = raw.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  const starCache = new Map<string, number>();
  for (const item of unique) {
    const repo = item.repository.nameWithOwner;
    if (!starCache.has(repo)) starCache.set(repo, await repoStars(repo));
  }

  const hunted: HuntedIssue[] = unique.map((item) => {
    const repo = item.repository.nameWithOwner;
    const labels = (item.labels ?? []).map((label) => label.name);
    const stars = starCache.get(repo) ?? 0;
    return {
      repo,
      issue: String(item.number),
      title: item.title,
      url: item.url,
      language,
      stars,
      labels,
      difficulty: classifyDifficulty(item.title, labels, stars)
    };
  });
  hunted.sort((a, b) => a.stars - b.stars);
  return hunted.slice(0, limit);
}

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function huntFilePath(cwd: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(cwd, ".guildless", `hunt-${stamp}.json`);
}

export async function huntCommand(argv: string[], cwd: string): Promise<number> {
  const json = argv.includes("--json");
  const languageRaw = flag(argv, "language") ?? "both";
  const limit = Number(flag(argv, "limit") ?? "30");

  const languages = languageRaw === "both" ? ["typescript", "python"] : [languageRaw];
  const all: HuntedIssue[] = [];
  for (const language of languages) {
    all.push(...await huntIssues(language, limit));
  }
  all.sort((a, b) => a.stars - b.stars);

  const file = huntFilePath(cwd);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`, "utf8");

  if (json) {
    process.stdout.write(`${JSON.stringify(all, null, 2)}\n`);
  } else {
    const lines = ["GUILDLESS HUNT", "", `Found ${all.length} candidate issues. Saved: ${path.relative(cwd, file).replaceAll("\\", "/")}`, ""];
    for (const item of all.slice(0, 30)) {
      lines.push(`[${item.difficulty.padEnd(6)}] ${item.repo}#${item.issue} (${item.stars}★) ${item.title}`);
    }
    console.log(lines.join("\n"));
  }
  return 0;
}
