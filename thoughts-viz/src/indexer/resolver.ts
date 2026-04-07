import { dirname, join } from "node:path";
import type { GraphEdge, ParsedFile, RawEdge } from "../types.ts";

export function resolveEdges(rawEdges: RawEdge[], files: ParsedFile[]): GraphEdge[] {
  // Build lookup maps
  const byFilename = new Map<string, string[]>(); // filename -> relativePaths
  const byRelativePath = new Set<string>();

  for (const file of files) {
    byRelativePath.add(file.relativePath);

    const existing = byFilename.get(file.filename) ?? [];
    existing.push(file.relativePath);
    byFilename.set(file.filename, existing);
  }

  const resolved: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const raw of rawEdges) {
    const targetId = resolveRef(raw.targetRef, raw.sourceFile, byFilename, byRelativePath);
    if (!targetId) continue;

    // Deduplicate same source-target-type
    const key = `${raw.sourceFile}|${targetId}|${raw.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    resolved.push({ source: raw.sourceFile, target: targetId, type: raw.type });

    // For bidirectional edges, add reverse
    if (raw.bidirectional) {
      const reverseKey = `${targetId}|${raw.sourceFile}|${raw.type}`;
      if (!seen.has(reverseKey)) {
        seen.add(reverseKey);
        resolved.push({ source: targetId, target: raw.sourceFile, type: raw.type });
      }
    }
  }

  return resolved;
}

function resolveRef(
  ref: string,
  sourceRelPath: string,
  byFilename: Map<string, string[]>,
  byRelativePath: Set<string>,
): string | null {
  // 1. Try as-is (might be a relativePath already)
  if (byRelativePath.has(ref)) return ref;

  // 2. Strip common prefixes like "thoughts/" from full paths
  const stripped = ref.replace(/^thoughts\//, "");
  if (byRelativePath.has(stripped)) return stripped;

  // 3. Try relative path resolution (e.g. "./filename.md")
  if (ref.startsWith("./") || ref.startsWith("../")) {
    const sourceDir = dirname(sourceRelPath);
    const resolved = join(sourceDir, ref);
    if (byRelativePath.has(resolved)) return resolved;
  }

  // 4. Try filename-only lookup
  const filename = ref.split("/").pop()!;
  const candidates = byFilename.get(filename);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  // Multiple matches — prefer same owner directory
  const sourceOwner = sourceRelPath.split("/")[0];
  const sameOwner = candidates.find((c) => c.startsWith(sourceOwner + "/"));
  return sameOwner ?? candidates[0]!;
}
