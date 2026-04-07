import matter from "gray-matter";
import type { ParsedFile, ScannedFile } from "../types.ts";

function extractFirstHeading(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function normalizeToArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

export function parseFileFromContent(scanned: ScannedFile, raw: string): ParsedFile {
  const { data: fm, content } = matter(raw);

  const topic =
    (fm.topic as string) || extractFirstHeading(content) || scanned.filename.replace(/\.md$/, "");

  return {
    ...scanned,
    topic,
    tags: normalizeToArray(fm.tags),
    status: (fm.status as string) ?? "unknown",
    author: (fm.researcher ?? fm.planner ?? fm.author ?? "unknown") as string,
    rawRelated: normalizeToArray(fm.related),
    rawSupersedes: normalizeToArray(fm.supersedes),
    rawResearch: typeof fm.research === "string" ? fm.research : null,
    bodyContent: content,
  };
}

export async function parseFile(scanned: ScannedFile): Promise<ParsedFile> {
  const raw = await Bun.file(scanned.absolutePath).text();
  return parseFileFromContent(scanned, raw);
}

export async function parseFiles(scanned: ScannedFile[]): Promise<ParsedFile[]> {
  return Promise.all(scanned.map(parseFile));
}
