#!/usr/bin/env bun
/**
 * Re-index all public repos for production deployment.
 * Run: bun scripts/reindex-prod.ts
 */
import { resolve } from "node:path";
import { $ } from "bun";

const ROOT = resolve(import.meta.dir, "..");
const CLI = resolve(ROOT, "src/index.ts");

const repos = [
  { path: "../../ai-toolbox/thoughts", output: "ai-toolbox.json", name: "AI Toolbox" },
  { path: "../../agent-swarm/thoughts", output: "agent-swarm.json", name: "Agent Swarm" },
  { path: "../../agent-fs/thoughts", output: "agent-fs.json", name: "Agent FS" },
  { path: "../../qa-use/thoughts", output: "qa-use.json", name: "QA Use" },
];

console.log(`Re-indexing ${repos.length} repos for production...\n`);

for (const repo of repos) {
  const thoughtsPath = resolve(ROOT, repo.path);
  const outputPath = resolve(ROOT, "public/data", repo.output);

  // Force re-index the cache first, then export
  await $`bun ${CLI} index ${thoughtsPath} --force`.quiet();
  await $`bun ${CLI} export ${thoughtsPath} -o ${outputPath} -n ${repo.name}`;
}

console.log("\nDone. Run 'bun run build' to build for deployment.");
