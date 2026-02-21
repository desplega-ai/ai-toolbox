import { ensureAuth } from "../config/index.ts";
import { formatError, formatOutput } from "../output/index.ts";
import type { CommandDef } from "../spec/parser.ts";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    const msg =
      body && typeof body === "object" && "message" in body
        ? (body as { message: string }).message
        : `HTTP ${status}`;
    super(msg);
    this.name = "ApiError";
  }
}

export async function executeApiCall(
  def: CommandDef,
  args: Record<string, unknown>,
  globalOpts?: { server?: string; apiKey?: string; json?: boolean },
): Promise<void> {
  const auth = ensureAuth();
  const serverUrl = globalOpts?.server || auth.serverUrl;
  const apiKey = globalOpts?.apiKey || auth.apiKey;

  // Ensure the path has /api prefix for the actual request
  const apiPath = def.path.startsWith("/api/") ? def.path : `/api${def.path}`;
  const url = new URL(apiPath, serverUrl);
  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    Accept: "application/json",
  };

  let response: Response;

  if (def.method === "GET") {
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    response = await fetch(url.toString(), { method: "GET", headers });
  } else {
    headers["Content-Type"] = "application/json";
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) body[key] = coerceValue(key, value, def);
    }
    response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    formatError(new ApiError(response.status, errorBody));
    process.exit(1);
  }

  const data = await response.json().catch(() => null);
  formatOutput(data, { json: globalOpts?.json });
}

function coerceValue(key: string, value: unknown, def: CommandDef): unknown {
  if (typeof value !== "string") return value;
  const param = def.parameters.find((p) => p.name === key);
  if (!param) return value;

  switch (param.type) {
    case "number":
      return Number(value);
    case "boolean":
      return value === "true" || value === "1";
    default:
      return value;
  }
}
