import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SECRET_PATTERNS: RegExp[] = [
  /\.pem$/,
  /\.key$/,
  /(^|\/)id_rsa$/,
  /(^|\/)id_ed25519$/,
  /(^|\/)\.ssh(\/|$)/,
  /(^|\/)\.aws(\/|$)/,
  /(^|\/)\.npmrc$/,
  /(^|\/)credentials$/
];

function isSecretFile(file: string): boolean {
  if (/(^|\/)\.env$/.test(file)) return true;
  const dotted = file.match(/(^|\/)\.env\.([^.]+)$/);
  if (dotted) {
    const suffix = dotted[2];
    const isTemplate = /^dist$/i.test(suffix) || /(example|sample|template)(\.|$)/i.test(suffix);
    return !isTemplate;
  }
  return SECRET_PATTERNS.some((pattern) => pattern.test(file));
}

export async function detectSecretFiles(cwd: string): Promise<string[]> {
  let files: string[];
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd, encoding: "utf8" });
    files = stdout.split("\0").filter(Boolean);
  } catch {
    return [];
  }
  return files.filter(isSecretFile);
}
