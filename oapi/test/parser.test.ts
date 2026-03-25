import { describe, expect, test } from "bun:test";
import {
  countEndpoints,
  extractPathParamValues,
  findEndpoint,
  getSpecVersion,
  isValidSpec,
  parseSpec,
} from "../src/spec/parser.ts";

// Minimal OpenAPI 3.1 spec for testing
const testSpec: Record<string, unknown> = {
  openapi: "3.1.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/health": {
      get: {
        summary: "Health Check",
        operationId: "healthCheck",
      },
    },
    "/v1/items": {
      get: {
        summary: "List Items",
        operationId: "listItems",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer" }, required: false },
          { name: "offset", in: "query", schema: { type: "integer" }, required: false },
        ],
      },
      post: {
        summary: "Create Item",
        operationId: "createItem",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string", enum: ["a", "b", "c"] },
                },
                required: ["name", "type"],
              },
            },
          },
        },
      },
    },
    "/v1/items/{item_id}": {
      get: {
        summary: "Get Item",
        operationId: "getItem",
      },
      delete: {
        summary: "Delete Item",
        operationId: "deleteItem",
      },
    },
  },
};

describe("parseSpec", () => {
  test("parses all endpoints", () => {
    const endpoints = parseSpec(testSpec);
    expect(endpoints.length).toBe(5);
  });

  test("extracts correct methods", () => {
    const endpoints = parseSpec(testSpec);
    const methods = endpoints.map((ep) => `${ep.method} ${ep.path}`).sort();
    expect(methods).toEqual([
      "DELETE /v1/items/{item_id}",
      "GET /health",
      "GET /v1/items",
      "GET /v1/items/{item_id}",
      "POST /v1/items",
    ]);
  });

  test("extracts path params", () => {
    const endpoints = parseSpec(testSpec);
    const getItem = endpoints.find((ep) => ep.operationId === "getItem");
    expect(getItem?.pathParams).toEqual(["item_id"]);
  });

  test("extracts query params", () => {
    const endpoints = parseSpec(testSpec);
    const listItems = endpoints.find((ep) => ep.operationId === "listItems");
    expect(listItems!.queryParams.length).toBe(2);
    expect(listItems!.queryParams[0]!.name).toBe("limit");
    expect(listItems!.queryParams[0]!.type).toBe("integer");
  });

  test("extracts body schema", () => {
    const endpoints = parseSpec(testSpec);
    const createItem = endpoints.find((ep) => ep.operationId === "createItem");
    expect(createItem!.hasRequiredBody).toBe(true);
    expect(createItem!.bodySchema).toBeDefined();
  });

  test("no body for GET endpoints", () => {
    const endpoints = parseSpec(testSpec);
    const health = endpoints.find((ep) => ep.operationId === "healthCheck");
    expect(health!.bodySchema).toBeUndefined();
    expect(health!.hasRequiredBody).toBe(false);
  });

  test("returns empty for spec without paths", () => {
    expect(parseSpec({ openapi: "3.1.0" })).toEqual([]);
  });
});

describe("findEndpoint", () => {
  const endpoints = parseSpec(testSpec);

  test("finds by exact path", () => {
    const matches = findEndpoint(endpoints, "/health");
    expect(matches.length).toBe(1);
    expect(matches[0]!.method).toBe("GET");
  });

  test("finds by exact path with multiple methods", () => {
    const matches = findEndpoint(endpoints, "/v1/items");
    expect(matches.length).toBe(2);
  });

  test("filters by method", () => {
    const matches = findEndpoint(endpoints, "/v1/items", "POST");
    expect(matches.length).toBe(1);
    expect(matches[0]!.method).toBe("POST");
  });

  test("matches literal path against template", () => {
    const matches = findEndpoint(endpoints, "/v1/items/abc123");
    expect(matches.length).toBe(2); // GET + DELETE
  });

  test("matches literal path with method filter", () => {
    const matches = findEndpoint(endpoints, "/v1/items/abc123", "DELETE");
    expect(matches.length).toBe(1);
    expect(matches[0]!.method).toBe("DELETE");
  });

  test("returns empty for unknown path", () => {
    const matches = findEndpoint(endpoints, "/v1/unknown");
    expect(matches.length).toBe(0);
  });
});

describe("extractPathParamValues", () => {
  test("extracts single param", () => {
    const result = extractPathParamValues("/v1/items/{item_id}", "/v1/items/abc123");
    expect(result).toEqual({ item_id: "abc123" });
  });

  test("extracts multiple params", () => {
    const result = extractPathParamValues(
      "/v1/{org}/items/{item_id}",
      "/v1/myorg/items/abc123",
    );
    expect(result).toEqual({ org: "myorg", item_id: "abc123" });
  });

  test("returns empty for no params", () => {
    const result = extractPathParamValues("/health", "/health");
    expect(result).toEqual({});
  });
});

describe("countEndpoints", () => {
  test("counts correctly", () => {
    expect(countEndpoints(testSpec)).toBe(5);
  });

  test("returns 0 for empty spec", () => {
    expect(countEndpoints({ openapi: "3.1.0" })).toBe(0);
  });
});

describe("getSpecVersion", () => {
  test("returns openapi version", () => {
    expect(getSpecVersion({ openapi: "3.1.0" })).toBe("3.1.0");
  });

  test("returns swagger version", () => {
    expect(getSpecVersion({ swagger: "2.0" })).toBe("2.0");
  });

  test("returns unknown for missing version", () => {
    expect(getSpecVersion({})).toBe("unknown");
  });
});

describe("isValidSpec", () => {
  test("valid OpenAPI 3.x spec", () => {
    expect(isValidSpec({ openapi: "3.1.0", paths: {} })).toBe(true);
  });

  test("valid Swagger 2.0 spec", () => {
    expect(isValidSpec({ swagger: "2.0", paths: {} })).toBe(true);
  });

  test("invalid: missing paths", () => {
    expect(isValidSpec({ openapi: "3.1.0" })).toBe(false);
  });

  test("invalid: missing version", () => {
    expect(isValidSpec({ paths: {} })).toBe(false);
  });

  test("invalid: paths is null", () => {
    expect(isValidSpec({ openapi: "3.1.0", paths: null })).toBe(false);
  });
});
