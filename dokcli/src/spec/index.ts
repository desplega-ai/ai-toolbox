import * as fs from "node:fs";
import * as path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPIV3 } from "openapi-types";
import { CONFIG_DIR } from "../config/index.ts";

export const SPEC_CACHE_PATH = path.join(CONFIG_DIR, "spec-cache.json");
const FALLBACK_SPEC_PATH = path.join(import.meta.dirname, "fallback.json");

export async function fetchSpec(serverUrl: string, apiKey: string): Promise<OpenAPIV3.Document> {
  const url = `${serverUrl}/api/settings.getOpenApiDocument`;
  const res = await fetch(url, {
    headers: { "x-api-key": apiKey },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch OpenAPI spec: HTTP ${res.status}`);
  }

  const raw = await res.json();
  // Dereference $refs
  const spec = (await SwaggerParser.dereference(raw as OpenAPIV3.Document)) as OpenAPIV3.Document;
  return spec;
}

interface SpecCache {
  cachedAt: string;
  spec: OpenAPIV3.Document;
}

const STALE_DAYS = 7;

export function saveSpecCache(spec: OpenAPIV3.Document): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const cache: SpecCache = { cachedAt: new Date().toISOString(), spec };
  fs.writeFileSync(SPEC_CACHE_PATH, JSON.stringify(cache), { mode: 0o600 });
}

export function loadSpecCache(): OpenAPIV3.Document | null {
  try {
    const raw = fs.readFileSync(SPEC_CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw);

    // Support both wrapped (new) and unwrapped (old) cache formats
    if (parsed.cachedAt && parsed.spec) {
      const ageMs = Date.now() - new Date(parsed.cachedAt).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      if (ageDays > STALE_DAYS) {
        console.warn(`Cached spec is ${ageDays} days old. Run 'dokcli spec refresh' to update.`);
      }
      return parsed.spec as OpenAPIV3.Document;
    }

    return parsed as OpenAPIV3.Document;
  } catch {
    return null;
  }
}

export function loadFallbackSpec(): OpenAPIV3.Document | null {
  try {
    const raw = fs.readFileSync(FALLBACK_SPEC_PATH, "utf-8");
    return JSON.parse(raw) as OpenAPIV3.Document;
  } catch {
    return null;
  }
}

export async function getSpec(): Promise<OpenAPIV3.Document> {
  const cached = loadSpecCache();
  if (cached) return cached;

  const fallback = loadFallbackSpec();
  if (fallback) return fallback;

  throw new Error(
    "No OpenAPI spec available. Run `dokcli spec fetch` to download it from the server.",
  );
}
