import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { DocType, ScannedFile } from "../types.ts";

function inferDocType(pathSegment: string): DocType {
  if (pathSegment === "research") return "research";
  if (pathSegment === "plans") return "plan";
  if (pathSegment === "brainstorms") return "brainstorm";
  return "research"; // fallback
}

function parseDateFromFilename(filename: string): string {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

async function walkDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(fullPath)));
    } else if (entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function scanDirectory(thoughtsDir: string): Promise<ScannedFile[]> {
  const absolutePaths = await walkDir(thoughtsDir);
  const files: ScannedFile[] = [];

  for (const absolutePath of absolutePaths) {
    const relativePath = relative(thoughtsDir, absolutePath);
    const filename = relativePath.split("/").pop()!;
    const segments = relativePath.split("/");

    // Expected structure: owner/type/file.md (e.g. shared/research/file.md)
    const owner = segments[0] ?? "unknown";
    const typeSegment = segments[1] ?? "";
    const docType = inferDocType(typeSegment);
    const date = parseDateFromFilename(filename);

    files.push({ absolutePath, relativePath, filename, owner, docType, date });
  }

  return files;
}
