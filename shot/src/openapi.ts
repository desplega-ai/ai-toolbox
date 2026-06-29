import { VERSION } from "./config";

/** OpenAPI 3.1 description of the service, served at /openapi.json. */
export function openapiSpec(): unknown {
  return {
    openapi: "3.1.0",
    info: {
      title: "shot",
      version: VERSION,
      description:
        "No-auth screenshot service. Renders a URL to PNG/JPEG using Playwright over CDP. " +
        "Bundled Chromium renders real pixels; CDP_URL can point at any Chrome/CDP backend.",
    },
    paths: {
      "/": {
        get: {
          summary: "Service help",
          description: "Human/agent-readable JSON describing the routes and example calls.",
          responses: {
            "200": {
              description: "Help document",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/health": {
        get: {
          summary: "Health check",
          description: "Liveness probe. Reports whether the browser backend is reachable.",
          responses: {
            "200": {
              description: "Service healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" },
                      backend: { type: "string", example: "chromium:bundled" },
                      browserConnected: { type: "boolean" },
                      uptimeSeconds: { type: "number" },
                    },
                  },
                },
              },
            },
            "503": { description: "Browser backend unreachable" },
          },
        },
      },
      "/screenshot": {
        get: {
          summary: "Capture a screenshot",
          description: "Navigate to `url` and return a PNG (default) or JPEG image of the page.",
          parameters: [
            {
              name: "url",
              in: "query",
              required: true,
              description: "Absolute http(s) URL to capture.",
              schema: { type: "string", format: "uri", example: "https://example.com" },
            },
            {
              name: "full_page",
              in: "query",
              required: false,
              description: "Capture the full scrollable page instead of just the viewport.",
              schema: { type: "boolean", default: false },
            },
            {
              name: "width",
              in: "query",
              required: false,
              description: "Viewport width in CSS pixels.",
              schema: { type: "integer", default: 1280 },
            },
            {
              name: "height",
              in: "query",
              required: false,
              description: "Viewport height in CSS pixels.",
              schema: { type: "integer", default: 800 },
            },
            {
              name: "format",
              in: "query",
              required: false,
              description: "Output image format.",
              schema: { type: "string", enum: ["png", "jpeg"], default: "png" },
            },
            {
              name: "quality",
              in: "query",
              required: false,
              description: "JPEG quality 0-100 (ignored for png).",
              schema: { type: "integer", minimum: 0, maximum: 100, default: 80 },
            },
            {
              name: "scale",
              in: "query",
              required: false,
              description: "Device scale factor (DPR) for retina-density output.",
              schema: { type: "number", default: 1 },
            },
            {
              name: "wait_until",
              in: "query",
              required: false,
              description: "Playwright navigation wait condition.",
              schema: {
                type: "string",
                enum: ["load", "domcontentloaded", "networkidle", "commit"],
                default: "load",
              },
            },
            {
              name: "delay",
              in: "query",
              required: false,
              description: "Extra milliseconds to wait after load before capturing.",
              schema: { type: "integer", default: 0 },
            },
            {
              name: "timeout",
              in: "query",
              required: false,
              description: "Navigation timeout in milliseconds.",
              schema: { type: "integer", default: 30000 },
            },
            {
              name: "dark",
              in: "query",
              required: false,
              description: "Emulate prefers-color-scheme: dark.",
              schema: { type: "boolean", default: false },
            },
          ],
          responses: {
            "200": {
              description: "The rendered image",
              content: {
                "image/png": { schema: { type: "string", format: "binary" } },
                "image/jpeg": { schema: { type: "string", format: "binary" } },
              },
            },
            "400": { description: "Missing or invalid parameters" },
            "403": { description: "Target blocked by SSRF guard" },
            "502": { description: "Failed to render the page" },
            "503": { description: "Server busy: render queue full (honor Retry-After)" },
          },
        },
      },
      "/openapi.json": {
        get: {
          summary: "OpenAPI document",
          responses: { "200": { description: "This document" } },
        },
      },
    },
  };
}
