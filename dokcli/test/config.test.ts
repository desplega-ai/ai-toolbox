import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ensureAuth, loadConfig } from "../src/config/index.ts";

describe("config", () => {
  let origApiKey: string | undefined;
  let origServerUrl: string | undefined;

  beforeEach(() => {
    origApiKey = process.env.DOKPLOY_API_KEY;
    origServerUrl = process.env.DOKPLOY_SERVER_URL;
  });

  afterEach(() => {
    if (origApiKey !== undefined) process.env.DOKPLOY_API_KEY = origApiKey;
    else delete process.env.DOKPLOY_API_KEY;
    if (origServerUrl !== undefined) process.env.DOKPLOY_SERVER_URL = origServerUrl;
    else delete process.env.DOKPLOY_SERVER_URL;
  });

  it("env var DOKPLOY_API_KEY overrides config", () => {
    process.env.DOKPLOY_API_KEY = "env-override-key";
    const config = loadConfig();
    expect(config.apiKey).toBe("env-override-key");
  });

  it("env var DOKPLOY_SERVER_URL overrides config", () => {
    process.env.DOKPLOY_SERVER_URL = "https://custom.example.com";
    const config = loadConfig();
    expect(config.serverUrl).toBe("https://custom.example.com");
  });

  it("ensureAuth returns key when env var set", () => {
    process.env.DOKPLOY_API_KEY = "my-key";
    const { apiKey, serverUrl } = ensureAuth();
    expect(apiKey).toBe("my-key");
    expect(serverUrl).toBeTruthy();
  });

  it("loadConfig returns a serverUrl", () => {
    const config = loadConfig();
    expect(config.serverUrl).toBeTruthy();
  });
});
