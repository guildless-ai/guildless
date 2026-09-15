import type { PersonaClientConfig } from "./types.js";

export interface PersonaSendResult {
  ok: boolean;
  method: "mcp" | "http" | "none";
  error?: string;
}

export interface PersonaStatus {
  ok: boolean;
  detail: string;
}

const DEFAULT_MCP_URL = "http://127.0.0.1:47831/mcp";
const DEFAULT_TOOL = "play_animation";

/**
 * Sends character actions to Persona. Persona exposes a local MCP server
 * (default http://127.0.0.1:47831/mcp). This client is deliberately defensive:
 * a missing or unreachable Persona never breaks the GUILDLESS bridge.
 */
export class PersonaClient {
  private readonly mcpUrl: string;
  private readonly toolName: string;
  private readonly httpUrl?: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: PersonaClientConfig = {}) {
    this.mcpUrl = config.mcpUrl ?? process.env.PERSONA_URL ?? DEFAULT_MCP_URL;
    this.toolName = config.toolName ?? process.env.PERSONA_MCP_TOOL ?? DEFAULT_TOOL;
    this.httpUrl = config.httpUrl ?? process.env.PERSONA_HTTP_URL;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async status(): Promise<PersonaStatus> {
    if (this.httpUrl) {
      try {
        const response = await this.fetchFn(`${this.httpUrl}/health`, { method: "GET", signal: AbortSignal.timeout(3000) });
        return { ok: response.ok, detail: `http ${this.httpUrl} -> ${response.status}` };
      } catch (error) {
        return { ok: false, detail: `http unreachable: ${String(error)}` };
      }
    }
    try {
      await this.mcpCall("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "guildless-persona", version: "0.1.0" } });
      return { ok: true, detail: `mcp ${this.mcpUrl}` };
    } catch (error) {
      return { ok: false, detail: `mcp unreachable: ${String(error)}` };
    }
  }

  async play(target: string, action: string, label: string): Promise<PersonaSendResult> {
    if (this.httpUrl) {
      try {
        const response = await this.fetchFn(`${this.httpUrl}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target, action, label }),
          signal: AbortSignal.timeout(10_000)
        });
        return { ok: response.ok, method: "http", error: response.ok ? undefined : `http ${response.status}` };
      } catch (error) {
        return { ok: false, method: "http", error: String(error) };
      }
    }
    try {
      await this.mcpCall("tools/call", {
        name: this.toolName,
        arguments: { target, action, label }
      });
      return { ok: true, method: "mcp" };
    } catch (error) {
      return { ok: false, method: "mcp", error: String(error) };
    }
  }

  private async mcpCall(method: string, params: unknown): Promise<unknown> {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const response = await this.fetchFn(this.mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream"
      },
      body,
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`mcp http ${response.status}`);
    const text = await response.text();
    return this.parseMcpResponse(text);
  }

  private parseMcpResponse(text: string): unknown {
    // Streamable HTTP may reply with SSE lines.
    const sse = text.split("\n").map((line) => line.trim()).find((line) => line.startsWith("data:"));
    const payload = sse ? sse.slice(5).trim() : text.trim();
    if (!payload) throw new Error("empty mcp response");
    const parsed = JSON.parse(payload) as { error?: { message?: string }; result?: unknown };
    if (parsed.error) throw new Error(parsed.error.message ?? "mcp error");
    return parsed.result;
  }
}
