import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { handleCommand } from "../../../lib/control";

export const dynamic = "force-dynamic";

const CONTROL_FILE = path.join(process.cwd(), "..", ".guildless", "office-control.json");

export async function POST(request: Request) {
  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text : "";
  } catch {
    text = "";
  }
  const result = handleCommand(text);
  try {
    mkdirSync(path.dirname(CONTROL_FILE), { recursive: true });
    writeFileSync(
      CONTROL_FILE,
      `${JSON.stringify({ ts: new Date().toISOString(), action: result.action, subject: result.subject, text }, null, 2)}\n`,
      "utf8"
    );
  } catch { /* signal file write is best effort */ }
  return NextResponse.json({ action: result.action, response: result.response, subject: result.subject ?? null });
}
