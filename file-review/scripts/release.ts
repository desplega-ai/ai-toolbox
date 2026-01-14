#!/usr/bin/env bun

const version = process.argv[2];

if (!version) {
  console.error("Usage: bun run release <version>");
  console.error("Example: bun run release 1.0.0");
  process.exit(1);
}

// Validate version format
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version format: ${version}`);
  console.error("Expected format: X.Y.Z (e.g., 1.0.0)");
  process.exit(1);
}

const tag = `file-review-v${version}`;

console.log(`Creating release ${tag}...`);

// Create and push tag
const tagResult = Bun.spawnSync(["git", "tag", tag], {
  cwd: import.meta.dir + "/..",
  stdout: "inherit",
  stderr: "inherit",
});

if (tagResult.exitCode !== 0) {
  console.error(`Failed to create tag ${tag}`);
  process.exit(1);
}

console.log(`Tag ${tag} created`);

const pushResult = Bun.spawnSync(["git", "push", "origin", tag], {
  cwd: import.meta.dir + "/..",
  stdout: "inherit",
  stderr: "inherit",
});

if (pushResult.exitCode !== 0) {
  console.error(`Failed to push tag ${tag}`);
  process.exit(1);
}

console.log(`Tag ${tag} pushed to origin`);
console.log(`\nRelease workflow triggered. Check: https://github.com/desplega-ai/ai-toolbox/actions`);
