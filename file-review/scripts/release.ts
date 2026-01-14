#!/usr/bin/env bun

import pkg from "../package.json";

const version = pkg.version;
const tag = `file-review-v${version}`;

console.log(`Preparing release ${tag}...`);

// Check if tag already exists locally
const localTagCheck = Bun.spawnSync(["git", "tag", "-l", tag], {
  cwd: import.meta.dir + "/..",
});
if (localTagCheck.stdout.toString().trim() === tag) {
  console.error(`Tag ${tag} already exists locally. Bump version in package.json first.`);
  process.exit(1);
}

// Check if tag exists on remote
const remoteTagCheck = Bun.spawnSync(["git", "ls-remote", "--tags", "origin", tag], {
  cwd: import.meta.dir + "/..",
});
if (remoteTagCheck.stdout.toString().includes(tag)) {
  console.error(`Tag ${tag} already exists on remote. Bump version in package.json first.`);
  process.exit(1);
}

// Get latest file-review tag and compare versions
const latestTagResult = Bun.spawnSync(
  ["git", "tag", "-l", "file-review-v*", "--sort=-v:refname"],
  { cwd: import.meta.dir + "/.." }
);
const tags = latestTagResult.stdout.toString().trim().split("\n").filter(Boolean);

if (tags.length > 0) {
  const latestTag = tags[0];
  const latestVersion = latestTag.replace("file-review-v", "");

  const parseVersion = (v: string) => v.split(".").map(Number);
  const [major, minor, patch] = parseVersion(version);
  const [latestMajor, latestMinor, latestPatch] = parseVersion(latestVersion);

  const isNewer =
    major > latestMajor ||
    (major === latestMajor && minor > latestMinor) ||
    (major === latestMajor && minor === latestMinor && patch > latestPatch);

  if (!isNewer) {
    console.error(`Version ${version} is not newer than latest release ${latestVersion}`);
    console.error(`Bump version in package.json first.`);
    process.exit(1);
  }

  console.log(`Latest release: ${latestVersion} -> New: ${version}`);
}

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
