import { dereference } from "@scalar/openapi-parser";

export interface ParamDef {
  name: string;
  type: string; // string, integer, number, boolean, array
  required: boolean;
  description: string;
  enum?: string[];
}

export interface EndpointDef {
  path: string; // e.g., "/v1/nodes/{node_id}"
  method: string; // GET, POST, PUT, DELETE, PATCH
  summary: string; // from operation summary/description
  operationId?: string;
  pathParams: string[]; // extracted from path template
  queryParams: ParamDef[];
  bodySchema?: object; // raw JSON schema for request body
  hasRequiredBody: boolean;
}

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "head", "options"] as const;

/**
 * Dereference a spec using @scalar/openapi-parser, resolving all $ref pointers.
 * Returns the fully resolved spec object.
 */
function dereferenceSpec(spec: Record<string, unknown>): Record<string, unknown> {
  const result = dereference(spec);
  // result.schema is the fully resolved version (all $refs inlined)
  if (result.schema) {
    return result.schema as unknown as Record<string, unknown>;
  }
  // Fallback to specification (partially resolved) or original
  if (result.specification) {
    return result.specification as unknown as Record<string, unknown>;
  }
  return spec;
}

function extractPathParams(pathStr: string): string[] {
  const matches = pathStr.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

function extractQueryParams(parameters: unknown[]): ParamDef[] {
  const result: ParamDef[] = [];
  for (const param of parameters) {
    if (typeof param !== "object" || param === null) continue;
    const p = param as Record<string, unknown>;
    if (p.in !== "query") continue;
    const schema = (p.schema as Record<string, unknown>) || {};
    result.push({
      name: (p.name as string) || "",
      type: (schema.type as string) || "string",
      required: (p.required as boolean) || false,
      description: (p.description as string) || "",
      enum: Array.isArray(schema.enum) ? (schema.enum as string[]) : undefined,
    });
  }
  return result;
}

function extractBodySchema(operation: Record<string, unknown>): {
  schema: object | undefined;
  required: boolean;
} {
  const requestBody = operation.requestBody as Record<string, unknown> | undefined;
  if (!requestBody) return { schema: undefined, required: false };

  const required = (requestBody.required as boolean) || false;
  const content = requestBody.content as Record<string, unknown> | undefined;
  if (!content) return { schema: undefined, required };

  // Try application/json first, then fallback to first content type
  const jsonContent = content["application/json"] as Record<string, unknown> | undefined;
  if (jsonContent?.schema) {
    return { schema: jsonContent.schema as object, required };
  }

  // Fallback: first content type
  const firstKey = Object.keys(content)[0];
  if (firstKey) {
    const first = content[firstKey] as Record<string, unknown> | undefined;
    if (first?.schema) {
      return { schema: first.schema as object, required };
    }
  }

  return { schema: undefined, required };
}

/**
 * Parse an OpenAPI spec into a flat list of endpoint definitions.
 * Uses @scalar/openapi-parser for $ref resolution.
 */
export function parseSpec(spec: Record<string, unknown>): EndpointDef[] {
  const resolved = dereferenceSpec(spec);
  const paths = resolved.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return [];

  const endpoints: EndpointDef[] = [];

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    // Collect path-level parameters
    const pathLevelParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as Record<string, unknown> | undefined;
      if (!operation) continue;

      // Merge path-level + operation-level parameters (operation takes precedence)
      const opParams = Array.isArray(operation.parameters) ? operation.parameters : [];
      const allParams = [...pathLevelParams, ...opParams];

      const { schema: bodySchema, required: bodyRequired } = extractBodySchema(operation);

      endpoints.push({
        path: pathStr,
        method: method.toUpperCase(),
        summary: (operation.summary as string) || (operation.description as string) || "",
        operationId: operation.operationId as string | undefined,
        pathParams: extractPathParams(pathStr),
        queryParams: extractQueryParams(allParams),
        bodySchema: bodySchema,
        hasRequiredBody: bodyRequired,
      });
    }
  }

  return endpoints;
}

/**
 * Find an endpoint matching the given path and optional method.
 * Supports both exact match and pattern matching for path params.
 */
export function findEndpoint(
  endpoints: EndpointDef[],
  targetPath: string,
  targetMethod?: string,
): EndpointDef[] {
  // Try exact match first
  let matches = endpoints.filter((ep) => ep.path === targetPath);

  // If no exact match, try pattern matching (literal path vs template)
  if (matches.length === 0) {
    matches = endpoints.filter((ep) => pathMatches(ep.path, targetPath));
  }

  // Filter by method if specified
  if (targetMethod) {
    matches = matches.filter((ep) => ep.method === targetMethod.toUpperCase());
  }

  return matches;
}

/**
 * Check if a spec path template matches a literal path.
 * e.g., "/v1/nodes/{node_id}" matches "/v1/nodes/abc123"
 */
function pathMatches(template: string, literal: string): boolean {
  const templateParts = template.split("/");
  const literalParts = literal.split("/");
  if (templateParts.length !== literalParts.length) return false;

  return templateParts.every(
    (tPart, i) => tPart === literalParts[i] || (tPart.startsWith("{") && tPart.endsWith("}")),
  );
}

/**
 * Extract path param values from a literal path using a template.
 */
export function extractPathParamValues(template: string, literal: string): Record<string, string> {
  const templateParts = template.split("/");
  const literalParts = literal.split("/");
  const params: Record<string, string> = {};

  for (let i = 0; i < templateParts.length; i++) {
    const tPart = templateParts[i];
    if (!tPart) continue;
    if (tPart.startsWith("{") && tPart.endsWith("}")) {
      const paramName = tPart.slice(1, -1);
      params[paramName] = literalParts[i] || "";
    }
  }

  return params;
}

/**
 * Count endpoints in a spec (for display purposes).
 */
export function countEndpoints(spec: Record<string, unknown>): number {
  return parseSpec(spec).length;
}

/**
 * Get the OpenAPI version from a spec.
 */
export function getSpecVersion(spec: Record<string, unknown>): string {
  return (spec.openapi as string) || (spec.swagger as string) || "unknown";
}

/**
 * Validate that an object looks like an OpenAPI spec.
 */
export function isValidSpec(spec: Record<string, unknown>): boolean {
  return (
    (typeof spec.openapi === "string" || typeof spec.swagger === "string") &&
    typeof spec.paths === "object" &&
    spec.paths !== null
  );
}
