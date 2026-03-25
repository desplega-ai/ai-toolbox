import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// Set up isolated config dir before importing config module
const testDir = path.join(os.tmpdir(), `oapi-test-${Date.now()}`);
process.env.OAPI_CONFIG_DIR = testDir;

// Dynamic import so env var is picked up
const {
  CONFIG_DIR,
  SPECS_DIR,
  deleteSpec,
  ensureConfigDir,
  getApi,
  getDefaultProfile,
  getProfile,
  loadConfig,
  loadSpec,
  saveConfig,
  saveSpec,
} = await import("../src/config/index.ts");

describe("config", () => {
  beforeEach(() => {
    // Ensure clean state
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test("CONFIG_DIR uses OAPI_CONFIG_DIR env var", () => {
    expect(CONFIG_DIR).toBe(testDir);
  });

  test("SPECS_DIR is under CONFIG_DIR", () => {
    expect(SPECS_DIR).toBe(path.join(testDir, "specs"));
  });

  test("ensureConfigDir creates directories", () => {
    ensureConfigDir();
    expect(fs.existsSync(CONFIG_DIR)).toBe(true);
    expect(fs.existsSync(SPECS_DIR)).toBe(true);
  });

  test("loadConfig returns defaults when no file exists", () => {
    const config = loadConfig();
    expect(config.apis).toEqual({});
    expect(config.profiles).toEqual({});
    expect(config.defaults).toEqual({});
  });

  test("saveConfig + loadConfig roundtrip", () => {
    const config = {
      apis: {
        test: {
          source: "remote" as const,
          url: "https://example.com/openapi.json",
          baseUrl: "https://example.com",
          lastRefreshed: "2026-03-25T00:00:00Z",
        },
      },
      profiles: {
        "test-key": {
          type: "header" as const,
          headerName: "X-Api-Key",
          value: "sk-123",
        },
      },
      defaults: { test: "test-key" },
    };

    saveConfig(config);
    const loaded = loadConfig();
    expect(loaded.apis.test!.baseUrl).toBe("https://example.com");
    expect(loaded.profiles["test-key"]!.value).toBe("sk-123");
    expect(loaded.defaults.test).toBe("test-key");
  });

  test("getApi returns entry", () => {
    saveConfig({
      apis: {
        myapi: {
          source: "local",
          path: "/tmp/spec.json",
          baseUrl: "http://localhost:3000",
          lastRefreshed: "2026-03-25T00:00:00Z",
        },
      },
      profiles: {},
      defaults: {},
    });
    const api = getApi("myapi");
    expect(api?.baseUrl).toBe("http://localhost:3000");
  });

  test("getApi returns undefined for missing", () => {
    expect(getApi("nonexistent")).toBeUndefined();
  });

  test("getProfile returns profile", () => {
    saveConfig({
      apis: {},
      profiles: { key1: { type: "bearer", value: "tok-123" } },
      defaults: {},
    });
    const profile = getProfile("key1");
    expect(profile?.type).toBe("bearer");
    expect(profile?.value).toBe("tok-123");
  });

  test("getDefaultProfile resolves default mapping", () => {
    saveConfig({
      apis: {},
      profiles: { key1: { type: "header", headerName: "X-Key", value: "val" } },
      defaults: { myapi: "key1" },
    });
    const profile = getDefaultProfile("myapi");
    expect(profile?.headerName).toBe("X-Key");
  });

  test("getDefaultProfile returns undefined when no default set", () => {
    expect(getDefaultProfile("nodefault")).toBeUndefined();
  });
});

describe("spec storage", () => {
  beforeEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test("saveSpec + loadSpec roundtrip", () => {
    const spec = { openapi: "3.1.0", paths: { "/health": { get: {} } } };
    saveSpec("test", spec);
    const loaded = loadSpec("test");
    expect(loaded).toEqual(spec);
  });

  test("loadSpec returns null for missing spec", () => {
    expect(loadSpec("missing")).toBeNull();
  });

  test("deleteSpec removes spec file", () => {
    saveSpec("todelete", { openapi: "3.1.0", paths: {} });
    expect(loadSpec("todelete")).not.toBeNull();
    deleteSpec("todelete");
    expect(loadSpec("todelete")).toBeNull();
  });

  test("deleteSpec does not throw for missing file", () => {
    expect(() => deleteSpec("nonexistent")).not.toThrow();
  });
});
