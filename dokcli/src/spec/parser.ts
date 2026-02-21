import type { OpenAPIV3 } from "openapi-types";

export interface ParamDef {
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  description: string;
  in: "query" | "body";
}

export interface CommandDef {
  tag: string;
  operation: string;
  method: "GET" | "POST";
  path: string;
  description: string;
  parameters: ParamDef[];
}

function mapSchemaType(
  schema: OpenAPIV3.SchemaObject | undefined,
): "string" | "number" | "boolean" {
  if (!schema) return "string";
  switch (schema.type) {
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

function extractBodyParams(requestBody: OpenAPIV3.RequestBodyObject | undefined): ParamDef[] {
  if (!requestBody) return [];
  const content = requestBody.content?.["application/json"];
  if (!content?.schema) return [];

  const schema = content.schema as OpenAPIV3.SchemaObject;
  if (schema.type !== "object" || !schema.properties) return [];

  const required = new Set(schema.required || []);
  const params: ParamDef[] = [];

  for (const [name, propSchema] of Object.entries(schema.properties)) {
    const prop = propSchema as OpenAPIV3.SchemaObject;
    params.push({
      name,
      type: mapSchemaType(prop),
      required: required.has(name),
      description: prop.description || "",
      in: "body",
    });
  }

  return params;
}

function extractQueryParams(
  parameters: (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[] | undefined,
): ParamDef[] {
  if (!parameters) return [];
  const params: ParamDef[] = [];

  for (const param of parameters) {
    if ("$ref" in param) continue;
    const p = param as OpenAPIV3.ParameterObject;
    if (p.in === "query") {
      params.push({
        name: p.name,
        type: mapSchemaType(p.schema as OpenAPIV3.SchemaObject | undefined),
        required: p.required || false,
        description: p.description || "",
        in: "query",
      });
    }
  }

  return params;
}

export function parseSpec(spec: OpenAPIV3.Document): CommandDef[] {
  const commands: CommandDef[] = [];

  for (const [pathStr, pathItem] of Object.entries(spec.paths || {})) {
    if (!pathItem) continue;

    // Extract tag and operation from path like /{tag}.{operation} or /api/{tag}.{operation}
    const match = pathStr.match(/^(?:\/api)?\/([^.]+)\.(.+)$/);
    if (!match) continue;
    const [, tag, operation] = match;
    if (!tag || !operation) continue;

    for (const method of ["get", "post"] as const) {
      const op = (pathItem as Record<string, unknown>)[method] as
        | OpenAPIV3.OperationObject
        | undefined;
      if (!op) continue;

      const parameters =
        method === "get"
          ? extractQueryParams(op.parameters)
          : extractBodyParams(op.requestBody as OpenAPIV3.RequestBodyObject | undefined);

      commands.push({
        tag,
        operation,
        method: method.toUpperCase() as "GET" | "POST",
        path: pathStr,
        description: op.summary || op.description || `${tag}.${operation}`,
        parameters,
      });
    }
  }

  return commands;
}
