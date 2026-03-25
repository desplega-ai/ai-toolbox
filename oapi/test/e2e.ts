#!/usr/bin/env bun
/**
 * E2E smoke test — registers a real API, checks /health, cleans up.
 * Uses a temp config dir so it doesn't touch ~/.oapi.
 *
 * Usage: bun test/e2e.ts
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const API_URL = "https://api.business-use.desplega.agent-swarm.dev/openapi.json";
const API_NAME = "e2e-test";
const CLI = path.resolve(import.meta.dir, "../src/index.ts");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oapi-e2e-"));
const env = { ...process.env, OAPI_CONFIG_DIR: tmpDir };

function run(args: string): string {
  const cmd = `bun ${CLI} ${args}`;
  try {
    // Merge stderr into stdout so we capture printSuccess/printError messages too
    return execSync(`${cmd} 2>&1`, { env, encoding: "utf-8", timeout: 30_000 }).trim();
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; status?: number };
    console.error(`  FAILED: ${cmd}`);
    if (e.stderr) console.error(`  stderr: ${e.stderr.trim()}`);
    if (e.stdout) console.error(`  stdout: ${e.stdout.trim()}`);
    process.exit(1);
  }
}

let passed = 0;

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err}`);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log(`\noapi e2e — config dir: ${tmpDir}\n`);

// ── Version
check("--version returns semver", () => {
  const out = run("--version");
  assert(/^\d+\.\d+\.\d+$/.test(out), `unexpected version: ${out}`);
});

// ── Register
check("register remote spec", () => {
  const out = run(`register --name ${API_NAME} --remote ${API_URL}`);
  assert(out.includes("Registered"), `expected 'Registered' in: ${out}`);
});

// ── List
check("list shows registered API", () => {
  const out = run("list");
  assert(out.includes(API_NAME), `expected '${API_NAME}' in list`);
});

// ── Docs (general)
check("docs general works", () => {
  const out = run("docs");
  assert(out.includes(API_NAME), `expected '${API_NAME}' in docs`);
});

// ── Docs (API)
check("docs <api> shows endpoints", () => {
  const out = run(`docs ${API_NAME}`);
  assert(out.includes("/health"), `expected '/health' in docs`);
});

// ── Docs (endpoint)
check("docs <api> /health GET shows example", () => {
  const out = run(`docs ${API_NAME} /health GET`);
  assert(out.includes("Example"), `expected 'Example' in endpoint docs`);
});

// ── Execute /health
check("x <api> /health returns 200 JSON", () => {
  const out = run(`x ${API_NAME} /health --raw`);
  const parsed = JSON.parse(out);
  assert(typeof parsed === "object" && parsed !== null, `expected JSON object, got: ${out}`);
});

// ── Execute /health --dry-run
check("x <api> /health --dry-run shows curl", () => {
  const out = run(`x ${API_NAME} /health --dry-run`);
  assert(out.includes("curl"), `expected 'curl' in dry-run output`);
});

// ── Refresh
check("refresh updates spec", () => {
  const out = run(`refresh ${API_NAME}`);
  assert(out.includes("Refreshed"), `expected 'Refreshed' in: ${out}`);
});

// ── Unregister
check("unregister removes API", () => {
  const out = run(`unregister ${API_NAME}`);
  assert(out.includes("Unregistered") || out.includes("Removed"), `expected confirmation in: ${out}`);
});

// ── List after unregister
check("list is empty after unregister", () => {
  const out = run("list");
  assert(!out.includes(API_NAME), `'${API_NAME}' should not be in list`);
});

// ── Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n  ${passed} checks passed ✓\n`);
