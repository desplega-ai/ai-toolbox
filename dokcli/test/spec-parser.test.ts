import { describe, expect, it } from "bun:test";
import type { OpenAPIV3 } from "openapi-types";
import { parseSpec } from "../src/spec/parser.ts";

function makeSpec(paths: OpenAPIV3.PathsObject): OpenAPIV3.Document {
  return {
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0.0" },
    paths,
  };
}

describe("parseSpec", () => {
  it("extracts tag and operation from dot-notation paths", () => {
    const spec = makeSpec({
      "/api/project.all": {
        get: {
          summary: "Get all projects",
          responses: {},
        },
      },
    });
    const commands = parseSpec(spec);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.tag).toBe("project");
    expect(commands[0]!.operation).toBe("all");
    expect(commands[0]!.method).toBe("GET");
    expect(commands[0]!.description).toBe("Get all projects");
  });

  it("extracts query parameters from GET endpoints", () => {
    const spec = makeSpec({
      "/api/project.one": {
        get: {
          summary: "Get one project",
          parameters: [
            { name: "projectId", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {},
        },
      },
    });
    const commands = parseSpec(spec);
    expect(commands[0]!.parameters).toHaveLength(1);
    expect(commands[0]!.parameters[0]!.name).toBe("projectId");
    expect(commands[0]!.parameters[0]!.required).toBe(true);
    expect(commands[0]!.parameters[0]!.in).toBe("query");
  });

  it("extracts body parameters from POST endpoints", () => {
    const spec = makeSpec({
      "/api/application.create": {
        post: {
          summary: "Create application",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "projectId"],
                  properties: {
                    name: { type: "string", description: "App name" },
                    projectId: { type: "string" },
                    description: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {},
        },
      },
    });
    const commands = parseSpec(spec);
    expect(commands[0]!.method).toBe("POST");
    expect(commands[0]!.parameters).toHaveLength(3);
    const nameParam = commands[0]!.parameters.find((p) => p.name === "name");
    expect(nameParam!.required).toBe(true);
    expect(nameParam!.in).toBe("body");
    const descParam = commands[0]!.parameters.find((p) => p.name === "description");
    expect(descParam!.required).toBe(false);
  });

  it("maps number and boolean types correctly", () => {
    const spec = makeSpec({
      "/api/settings.update": {
        post: {
          summary: "Update settings",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    port: { type: "integer" },
                    enabled: { type: "boolean" },
                    name: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {},
        },
      },
    });
    const commands = parseSpec(spec);
    const params = commands[0]!.parameters;
    expect(params.find((p) => p.name === "port")!.type).toBe("number");
    expect(params.find((p) => p.name === "enabled")!.type).toBe("boolean");
    expect(params.find((p) => p.name === "name")!.type).toBe("string");
  });

  it("handles empty spec", () => {
    const spec = makeSpec({});
    expect(parseSpec(spec)).toHaveLength(0);
  });

  it("skips paths without dot-notation", () => {
    const spec = makeSpec({
      "/health": { get: { summary: "Health check", responses: {} } },
    });
    expect(parseSpec(spec)).toHaveLength(0);
  });

  it("parses the real fallback spec", () => {
    const raw = require("../src/spec/fallback.json");
    const commands = parseSpec(raw as OpenAPIV3.Document);
    expect(commands.length).toBeGreaterThan(100);
    const tags = new Set(commands.map((c) => c.tag));
    expect(tags.size).toBeGreaterThan(30);
    expect(tags.has("project")).toBe(true);
    expect(tags.has("application")).toBe(true);
    expect(tags.has("settings")).toBe(true);
  });
});
