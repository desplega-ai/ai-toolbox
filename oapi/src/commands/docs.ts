import chalk from "chalk";
import { Command } from "commander";
import { getApi, loadConfig, loadSpec } from "../config/index.ts";
import { printError } from "../output/index.ts";
import {
  collapseNullable,
  extractEnumValues,
  flattenProperties,
  getSchemaType,
} from "../spec/helpers.ts";
import { type EndpointDef, findEndpoint, getSpecVersion, parseSpec } from "../spec/parser.ts";

// ─── Example Value Generation ────────────────────────────────────────────────

function exampleValue(name: string, typeStr: string, schema?: Record<string, unknown>): string {
  // Enum: use first value
  const enumVals = schema ? extractEnumValues(schema) : undefined;
  if (enumVals && enumVals.length > 0) return String(enumVals[0]);

  const collapsed = schema ? collapseNullable(schema) : {};
  const type = (collapsed.type as string) || typeStr;

  // Use default if available
  if (collapsed.default !== undefined) return String(collapsed.default);

  // Sensible defaults by name patterns
  if (name === "limit") return "10";
  if (name === "offset") return "0";
  if (name.endsWith("_id") || name === "id") return "my-id";
  if (name === "url") return "https://example.com";
  if (name === "email") return "user@example.com";
  if (name === "name") return "my-name";

  // By type
  if (type === "integer" || type === "number") return "1";
  if (type === "boolean") return "true";
  if (type.startsWith("array")) return "[]";
  if (type === "object") return "{}";
  return `my-${name}`;
}

// ─── Section Renderers ──────────────────────────────────────────────────────

function methodColor(method: string): string {
  switch (method) {
    case "GET":
      return chalk.green(method);
    case "POST":
      return chalk.yellow(method);
    case "PUT":
      return chalk.blue(method);
    case "DELETE":
      return chalk.red(method);
    case "PATCH":
      return chalk.magenta(method);
    default:
      return chalk.white(method);
  }
}

function renderEndpointDocs(apiName: string, ep: EndpointDef): void {
  // ── Header
  console.log(chalk.bold(`${methodColor(ep.method)} ${ep.path}`));
  if (ep.summary) console.log(chalk.dim(`  ${ep.summary}`));
  if (ep.operationId) console.log(chalk.dim(`  operationId: ${ep.operationId}`));
  console.log("");

  const bodySchema = ep.bodySchema as Record<string, unknown> | undefined;
  const isArrayBody = bodySchema?.type === "array";
  const { properties: bodyProps, required: bodyRequired } =
    bodySchema && !isArrayBody
      ? flattenProperties(bodySchema)
      : { properties: {} as Record<string, Record<string, unknown>>, required: [] as string[] };
  const bodyPropNames = Object.keys(bodyProps);

  // ── Path Parameters
  if (ep.pathParams.length > 0) {
    console.log(chalk.bold.underline("Path Parameters"));
    console.log(chalk.dim("  Substituted into the URL. Pass via -F or use the literal path."));
    console.log("");
    for (const param of ep.pathParams) {
      const ex = exampleValue(param, "string");
      console.log(`  ${chalk.cyan(param)}  ${chalk.dim("string (required)")}`);
      console.log(`    ${chalk.dim("→")} -F ${param}=${ex}`);
      console.log(
        `    ${chalk.dim("→ or use literal path:")} oapi x ${apiName} ${ep.path.replace(`{${param}}`, ex)} ${ep.method}`,
      );
    }
    console.log("");
  }

  // ── Body Parameters
  if (bodyPropNames.length > 0) {
    console.log(chalk.bold.underline("Body Parameters"));
    console.log(
      chalk.dim(
        `  Sent as JSON body. Pass each with ${chalk.white("-F key=value")} (auto-typed) or ${chalk.white("-f key=value")} (raw string).`,
      ),
    );
    console.log("");
    for (const name of bodyPropNames) {
      const propSchema = (bodyProps[name] || {}) as Record<string, unknown>;
      const typeStr = getSchemaType(propSchema);
      const isReq = bodyRequired.includes(name);
      const reqLabel = isReq ? chalk.red("required") : chalk.dim("optional");
      const ex = exampleValue(name, typeStr, propSchema);
      const desc = (collapseNullable(propSchema).description as string) || "";

      console.log(
        `  ${chalk.cyan(name)}  ${typeStr} (${reqLabel})${desc ? chalk.dim(`  ${desc}`) : ""}`,
      );
      console.log(`    ${chalk.dim("→")} -F ${name}=${ex}`);

      // Extra hints for complex types
      if (typeStr.startsWith("array")) {
        console.log(`    ${chalk.dim("→ JSON array:")} -F '${name}=["a","b"]'`);
      } else if (typeStr === "object") {
        console.log(`    ${chalk.dim("→ nested:")} -F ${name}.key=value`);
      }
    }
    console.log("");
  }

  // ── Array Body
  if (isArrayBody) {
    console.log(chalk.bold.underline("Body (Array)"));
    console.log(
      chalk.dim("  This endpoint expects an array body. Use --input with a JSON file or stdin."),
    );
    console.log("");
    console.log(
      `    ${chalk.dim("→ from file:")}  oapi x ${apiName} ${ep.path} ${ep.method} --input data.json`,
    );
    console.log(
      `    ${chalk.dim("→ from stdin:")} echo '[...]' | oapi x ${apiName} ${ep.path} ${ep.method} --input -`,
    );
    console.log("");
  }

  // ── Query Parameters
  if (ep.queryParams.length > 0) {
    console.log(chalk.bold.underline("Query Parameters"));
    console.log(chalk.dim(`  Appended to the URL. Pass each with ${chalk.white("-F key=value")}.`));
    console.log("");
    for (const qp of ep.queryParams) {
      const reqLabel = qp.required ? chalk.red("required") : chalk.dim("optional");
      const typeStr = qp.enum ? `enum(${qp.enum.join("|")})` : qp.type;
      const ex = exampleValue(qp.name, typeStr, qp.enum ? { enum: qp.enum } : undefined);
      const desc = qp.description ? chalk.dim(`  ${qp.description}`) : "";

      console.log(`  ${chalk.cyan(qp.name)}  ${typeStr} (${reqLabel})${desc}`);
      console.log(`    ${chalk.dim("→")} -F ${qp.name}=${ex}`);
    }
    console.log("");
  }

  // ── Full Example
  console.log(chalk.bold.underline("Example"));
  console.log("");
  const parts: string[] = [`  oapi x ${apiName} ${ep.path} ${ep.method}`];

  // Add required body params
  for (const name of bodyRequired.slice(0, 5)) {
    const propSchema = (bodyProps[name] || {}) as Record<string, unknown>;
    const typeStr = getSchemaType(propSchema);
    const ex = exampleValue(name, typeStr, propSchema);
    parts.push(`-F ${name}=${ex}`);
  }

  // Add first optional query param as example
  if (ep.queryParams.length > 0) {
    const qp = ep.queryParams[0];
    if (qp) {
      const ex = exampleValue(qp.name, qp.type, qp.enum ? { enum: qp.enum } : undefined);
      parts.push(`-F ${qp.name}=${ex}`);
    }
  }

  // Add path params
  for (const param of ep.pathParams) {
    const ex = exampleValue(param, "string");
    parts.push(`-F ${param}=${ex}`);
  }

  // Print as multi-line if long
  const full = parts.join(" ");
  if (full.length > 80 && parts.length > 2) {
    console.log(`  ${parts[0]} \\`);
    for (let i = 1; i < parts.length; i++) {
      const suffix = i < parts.length - 1 ? " \\" : "";
      console.log(`    ${parts[i]}${suffix}`);
    }
  } else {
    console.log(`  ${full}`);
  }

  console.log("");

  // ── Useful Variations
  console.log(chalk.bold.underline("Variations"));
  console.log("");
  console.log(
    `  ${chalk.dim("Dry run:")}       oapi x ${apiName} ${ep.path} ${ep.method} --dry-run`,
  );
  console.log(
    `  ${chalk.dim("Raw output:")}    oapi x ${apiName} ${ep.path} ${ep.method} --raw | jq '.'`,
  );
  console.log(
    `  ${chalk.dim("With profile:")}  oapi x ${apiName} ${ep.path} ${ep.method} --profile my-key`,
  );
  if (ep.method === "GET") {
    console.log(
      `  ${chalk.dim("Filter:")}        oapi x ${apiName} ${ep.path} ${ep.method} --jq '.[].id'`,
    );
  }
  console.log("");
}

function renderApiOverview(apiName: string, baseUrl: string, spec: Record<string, unknown>): void {
  const endpoints = parseSpec(spec);
  const version = getSpecVersion(spec);

  console.log(chalk.bold(`${chalk.cyan(apiName)} — ${baseUrl}`));
  console.log(chalk.dim(`OpenAPI ${version} | ${endpoints.length} endpoints`));
  console.log("");

  // ── Quick Reference
  console.log(chalk.bold.underline("Quick Reference"));
  console.log("");

  // Group by path
  const byPath = new Map<string, EndpointDef[]>();
  for (const ep of endpoints) {
    const existing = byPath.get(ep.path) || [];
    existing.push(ep);
    byPath.set(ep.path, existing);
  }

  for (const [pathStr, eps] of byPath) {
    for (const ep of eps) {
      const summary = ep.summary ? chalk.dim(ep.summary) : "";

      // Build a one-liner example
      const exParts: string[] = [];

      // Show required body params inline
      if (ep.bodySchema) {
        const schema = ep.bodySchema as Record<string, unknown>;
        if (schema.type !== "array") {
          const { properties, required } = flattenProperties(schema);
          for (const name of required.slice(0, 2)) {
            const propSchema = (properties[name] || {}) as Record<string, unknown>;
            const ex = exampleValue(name, getSchemaType(propSchema), propSchema);
            exParts.push(`-F ${name}=${ex}`);
          }
          if (required.length > 2) exParts.push("...");
        } else {
          exParts.push("--input data.json");
        }
      }

      const exStr = exParts.length > 0 ? chalk.dim(` ${exParts.join(" ")}`) : "";
      console.log(`  ${methodColor(ep.method).padEnd(16)} ${pathStr}${exStr}`);
      if (summary) console.log(`  ${" ".repeat(6)} ${summary}`);
    }
  }

  console.log("");

  // ── How to Use
  console.log(chalk.bold.underline("How to Use"));
  console.log("");
  console.log(
    `  ${chalk.bold("Query params:")}   -F key=value            ${chalk.dim("auto-typed: numbers, booleans, JSON parsed")}`,
  );
  console.log(
    `  ${chalk.bold("Body params:")}    -F key=value            ${chalk.dim("same syntax — oapi routes to body for POST/PUT/PATCH")}`,
  );
  console.log(
    `  ${chalk.bold("String only:")}    -f key=value            ${chalk.dim("no type conversion, always a string")}`,
  );
  console.log(
    `  ${chalk.bold("Nested object:")}  -F obj.key=value        ${chalk.dim("dot notation → { obj: { key: value } }")}`,
  );
  console.log(
    `  ${chalk.bold("JSON value:")}     -F 'ids=["a","b"]'      ${chalk.dim("arrays/objects parsed from JSON")}`,
  );
  console.log(
    `  ${chalk.bold("From file:")}      -F data=@file.json      ${chalk.dim("file contents as value")}`,
  );
  console.log(
    `  ${chalk.bold("Full body:")}      --input body.json       ${chalk.dim("entire request body from file")}`,
  );
  console.log(`  ${chalk.bold("From stdin:")}     echo '{...}' | ... --input -`);
  console.log(
    `  ${chalk.bold("Path params:")}    -F node_id=abc          ${chalk.dim("substitutes {node_id} in path")}`,
  );
  console.log(
    `  ${chalk.bold("  or literal:")}   /v1/nodes/abc           ${chalk.dim("auto-matched against spec templates")}`,
  );
  console.log(
    `  ${chalk.bold("Headers:")}        -H Key:Value            ${chalk.dim("custom headers")}`,
  );
  console.log(
    `  ${chalk.bold("Auth profile:")}   --profile name          ${chalk.dim("use a stored auth profile")}`,
  );
  console.log(
    `  ${chalk.bold("No validation:")}  --no-validate           ${chalk.dim("skip schema checks")}`,
  );
  console.log(
    `  ${chalk.bold("See curl:")}       --dry-run               ${chalk.dim("print curl command, don't execute")}`,
  );
  console.log(
    `  ${chalk.bold("Filter:")}         --jq '.[] | .id'        ${chalk.dim("pipe output through jq")}`,
  );
  console.log(
    `  ${chalk.bold("Verbose:")}        --verbose               ${chalk.dim("show request/response headers")}`,
  );
  console.log("");
  console.log(chalk.dim(`Details: oapi docs ${apiName} <path> [method]`));
  console.log("");
}

function renderGeneralDocs(): void {
  console.log(chalk.bold("oapi — Dynamic CLI for OpenAPI specs"));
  console.log("");

  // Show registered APIs
  const config = loadConfig();
  const apiNames = Object.keys(config.apis);

  if (apiNames.length > 0) {
    console.log(chalk.bold.underline("Registered APIs"));
    console.log("");
    for (const name of apiNames) {
      const api = config.apis[name];
      if (!api) continue;
      const spec = loadSpec(name);
      const count = spec ? parseSpec(spec).length : "?";
      console.log(
        `  ${chalk.cyan(name.padEnd(20))} ${api.baseUrl}  ${chalk.dim(`(${count} endpoints)`)}`,
      );
    }
    console.log("");
  } else {
    console.log(chalk.dim("  No APIs registered yet."));
    console.log("");
  }

  // Workflow
  console.log(chalk.bold.underline("Getting Started"));
  console.log("");
  console.log(
    `  ${chalk.bold("1. Register")}   oapi register --name myapi --remote https://api.example.com/openapi.json`,
  );
  console.log(`  ${chalk.bold("2. Explore")}    oapi docs myapi`);
  console.log(`  ${chalk.bold("3. Execute")}    oapi x myapi /health`);
  console.log(
    `  ${chalk.bold("4. Auth")}       oapi profile add --name key --type header --header-name X-Api-Key --value sk-...`,
  );
  console.log(`                oapi profile set-default myapi key`);
  console.log("");

  // Cheat sheet
  console.log(chalk.bold.underline("Passing Parameters"));
  console.log("");
  console.log(
    `  ${chalk.bold("Query params:")}   -F key=value            ${chalk.dim("auto-typed: numbers, booleans, JSON parsed")}`,
  );
  console.log(
    `  ${chalk.bold("Body params:")}    -F key=value            ${chalk.dim("same syntax — oapi routes to body for POST/PUT/PATCH")}`,
  );
  console.log(
    `  ${chalk.bold("String only:")}    -f key=value            ${chalk.dim("no type conversion, always a string")}`,
  );
  console.log(
    `  ${chalk.bold("Nested object:")}  -F obj.key=value        ${chalk.dim("dot notation → { obj: { key: value } }")}`,
  );
  console.log(
    `  ${chalk.bold("JSON value:")}     -F 'ids=["a","b"]'      ${chalk.dim("arrays/objects parsed from JSON")}`,
  );
  console.log(
    `  ${chalk.bold("From file:")}      -F data=@file.json      ${chalk.dim("file contents as value")}`,
  );
  console.log(
    `  ${chalk.bold("Full body:")}      --input body.json       ${chalk.dim("entire request body from file")}`,
  );
  console.log(`  ${chalk.bold("From stdin:")}     echo '{...}' | ... --input -`);
  console.log(
    `  ${chalk.bold("Path params:")}    -F node_id=abc          ${chalk.dim("substitutes {node_id} in path")}`,
  );
  console.log(
    `  ${chalk.bold("  or literal:")}   /v1/nodes/abc           ${chalk.dim("auto-matched against spec templates")}`,
  );
  console.log("");

  console.log(chalk.bold.underline("Useful Flags"));
  console.log("");
  console.log(
    `  ${chalk.bold("-H Key:Value")}    Custom header             ${chalk.dim("e.g. -H X-Api-Key:sk-123")}`,
  );
  console.log(
    `  ${chalk.bold("--profile name")}  Use stored auth profile   ${chalk.dim("see: oapi profile --help")}`,
  );
  console.log(
    `  ${chalk.bold("--dry-run")}       Print curl, don't send    ${chalk.dim("great for debugging")}`,
  );
  console.log(
    `  ${chalk.bold("--verbose")}       Show request/response     ${chalk.dim("headers on stderr")}`,
  );
  console.log(
    `  ${chalk.bold("--jq <expr>")}     Filter with jq            ${chalk.dim("e.g. --jq '.[].id'")}`,
  );
  console.log(
    `  ${chalk.bold("--raw")}           Compact JSON              ${chalk.dim("pipeable to jq")}`,
  );
  console.log(
    `  ${chalk.bold("--no-validate")}   Skip schema checks        ${chalk.dim("bypass validation")}`,
  );
  console.log("");

  if (apiNames.length > 0) {
    console.log(chalk.dim(`Tip: oapi docs ${apiNames[0]} — see all endpoints for an API`));
    console.log(
      chalk.dim(`     oapi docs ${apiNames[0]} <path> — see params for a specific endpoint`),
    );
  } else {
    console.log(chalk.dim("Tip: oapi docs <api-name> — see all endpoints for a registered API"));
  }
  console.log("");
}

// ─── Command ─────────────────────────────────────────────────────────────────

export const docsCommand = new Command("docs")
  .description("Show usage examples and parameter docs for an API")
  .argument("[api-name]", "Registered API name (omit for general docs)")
  .argument("[path]", "Endpoint path (shows detailed docs)")
  .argument("[method]", "HTTP method (narrows to one endpoint)")
  .action((apiName?: string, targetPath?: string, targetMethod?: string) => {
    // No api-name → general docs
    if (!apiName) {
      renderGeneralDocs();
      return;
    }

    const api = getApi(apiName);
    if (!api) {
      printError(`API '${apiName}' not found. Run 'oapi list' to see registered APIs.`);
      process.exit(1);
    }

    const spec = loadSpec(apiName);
    if (!spec) {
      printError(`Cached spec for '${apiName}' not found. Run 'oapi refresh ${apiName}'.`);
      process.exit(1);
    }

    // No path → overview
    if (!targetPath) {
      renderApiOverview(apiName, api.baseUrl, spec);
      return;
    }

    // Path provided → endpoint detail
    const endpoints = parseSpec(spec);
    const matches = findEndpoint(endpoints, targetPath, targetMethod);

    if (matches.length === 0) {
      printError(
        `No endpoint matching '${targetPath}'${targetMethod ? ` ${targetMethod}` : ""} in '${apiName}'.`,
      );

      // Suggest similar paths
      const allPaths = [...new Set(endpoints.map((ep) => ep.path))];
      const similar = allPaths.filter((p) => {
        const targetParts = targetPath.split("/");
        const parts = p.split("/");
        return parts.some((seg) => targetParts.some((t) => t === seg && seg.length > 1));
      });
      if (similar.length > 0) {
        console.error(chalk.dim(`  Did you mean: ${similar.join(", ")}?`));
      }
      process.exit(1);
    }

    for (const ep of matches) {
      renderEndpointDocs(apiName, ep);
      if (matches.length > 1) {
        console.log(chalk.dim("─".repeat(60)));
        console.log("");
      }
    }
  });
