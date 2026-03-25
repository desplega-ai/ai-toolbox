import * as fs from "node:fs";
import chalk from "chalk";
import { Command } from "commander";
import { getApi, getDefaultProfile, getProfile, loadSpec } from "../config/index.ts";
import type { Profile } from "../config/types.ts";
import { executeRequest } from "../http/client.ts";
import { printError, printJson } from "../output/index.ts";
import {
  collapseNullable,
  extractEnumValues,
  flattenProperties,
  getSchemaType,
} from "../spec/helpers.ts";
import {
  type EndpointDef,
  extractPathParamValues,
  findEndpoint,
  getSpecVersion,
  parseSpec,
} from "../spec/parser.ts";
import { validateInput } from "../validation/index.ts";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

// ─── Field Parsing ───────────────────────────────────────────────────────────

/**
 * Parse a single value with type coercion for -F (typed fields).
 * Numbers → number, booleans → boolean, null → null, JSON → parsed, @file → file content.
 */
function parseTypedValue(raw: string): unknown {
  // @file: read file content
  if (raw.startsWith("@")) {
    const filePath = raw.slice(1);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    } catch {
      printError(`Cannot read file: ${filePath}`);
      process.exit(2);
    }
  }

  // null
  if (raw === "null") return null;

  // booleans
  if (raw === "true") return true;
  if (raw === "false") return false;

  // JSON arrays/objects
  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
    try {
      return JSON.parse(raw);
    } catch {
      // Not valid JSON, treat as string
      return raw;
    }
  }

  // Numbers — only if the entire string is a valid number
  if (raw !== "" && !Number.isNaN(Number(raw))) {
    const num = Number(raw);
    // Preserve integer vs float distinction
    return num;
  }

  return raw;
}

/**
 * Set a value at a dot-notation path in an object.
 * e.g., setNested(obj, "handler.type", "http") → obj.handler.type = "http"
 */
function setNested(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split(".");
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string;
    if (
      current[part] === undefined ||
      typeof current[part] !== "object" ||
      current[part] === null
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1] as string;
  current[lastPart] = value;
}

/**
 * Parse -F key=value fields into an object with type coercion and dot notation.
 */
function parseTypedFields(fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const eqIndex = field.indexOf("=");
    if (eqIndex === -1) {
      setNested(result, field, true);
    } else {
      const key = field.slice(0, eqIndex);
      const raw = field.slice(eqIndex + 1);
      setNested(result, key, parseTypedValue(raw));
    }
  }
  return result;
}

/**
 * Parse -f key=value fields into an object (always strings, with dot notation).
 */
function parseRawFields(fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const eqIndex = field.indexOf("=");
    if (eqIndex === -1) {
      setNested(result, field, "");
    } else {
      const key = field.slice(0, eqIndex);
      const value = field.slice(eqIndex + 1);
      setNested(result, key, value);
    }
  }
  return result;
}

/**
 * Parse -H key:value headers into a record.
 */
function parseHeaders(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers) {
    const colonIndex = header.indexOf(":");
    if (colonIndex === -1) {
      printError(`Invalid header format: '${header}'. Use 'Key:Value' format.`);
      process.exit(2);
    }
    const key = header.slice(0, colonIndex).trim();
    const value = header.slice(colonIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

// ─── Auth Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the auth profile for a request.
 * Priority: --profile flag > API default > none
 */
function resolveProfile(apiName: string, profileOption?: string): Profile | undefined {
  if (profileOption) {
    const profile = getProfile(profileOption);
    if (!profile) {
      printError(`Profile '${profileOption}' does not exist`);
      process.exit(1);
    }
    return profile;
  }
  return getDefaultProfile(apiName);
}

/**
 * Apply auth from a profile to headers and query params.
 * Manual -H headers take precedence (are not overwritten).
 */
function applyAuth(
  profile: Profile,
  headers: Record<string, string>,
  queryParams: Record<string, string> | undefined,
): Record<string, string> | undefined {
  switch (profile.type) {
    case "header": {
      const headerName = profile.headerName || "Authorization";
      // Manual headers take precedence
      if (!headers[headerName]) {
        headers[headerName] = profile.value;
      }
      break;
    }
    case "bearer": {
      if (!headers.Authorization) {
        headers.Authorization = `Bearer ${profile.value}`;
      }
      break;
    }
    case "basic": {
      if (!headers.Authorization) {
        const encoded = Buffer.from(profile.value).toString("base64");
        headers.Authorization = `Basic ${encoded}`;
      }
      break;
    }
    case "query": {
      const param = profile.queryParam;
      if (param) {
        const qp = queryParams || {};
        if (!qp[param]) {
          qp[param] = profile.value;
        }
        return qp;
      }
      break;
    }
  }
  return queryParams;
}

/**
 * Mask a value for verbose display: show first 3 chars + "***"
 */
function maskForVerbose(value: string): string {
  if (value.length <= 3) return "***";
  return `${value.slice(0, 3)}***`;
}

/**
 * Mask auth header values in headers for verbose display.
 */
function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  const sensitiveHeaders = new Set([
    "authorization",
    "x-api-key",
    "x-auth-token",
    "api-key",
    "apikey",
  ]);

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.has(key.toLowerCase())) {
      masked[key] = maskForVerbose(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

// ─── jq Filtering ────────────────────────────────────────────────────────────

/**
 * Check if system jq is available.
 */
async function isJqAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", "jq"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Pipe JSON data through system jq with the given expression.
 */
async function filterWithJq(data: unknown, expr: string): Promise<void> {
  const available = await isJqAvailable();
  if (!available) {
    printError(
      "jq is not installed. Install it with: brew install jq (macOS) or apt install jq (Linux)",
    );
    process.exit(2);
  }

  const input = JSON.stringify(data);
  const proc = Bun.spawn(["jq", expr], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.stdin.write(input);
  proc.stdin.end();

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    printError(`jq error: ${stderr.trim()}`);
    process.exit(1);
  }

  process.stdout.write(stdout);
}

// ─── Path Suggestion ─────────────────────────────────────────────────────────

/**
 * Find similar paths in the spec for "did you mean?" hints.
 * Uses simple substring/prefix matching.
 */
function suggestPaths(endpoints: EndpointDef[], targetPath: string): string[] {
  const allPaths = [...new Set(endpoints.map((e) => e.path))];
  const target = targetPath.toLowerCase();
  const targetParts = target.split("/").filter(Boolean);

  const scored = allPaths
    .map((p) => {
      const pLower = p.toLowerCase();
      const pParts = pLower.split("/").filter(Boolean);

      let score = 0;
      // Substring match
      if (pLower.includes(target) || target.includes(pLower)) {
        score += 5;
      }
      // Shared prefix segments
      for (let i = 0; i < Math.min(targetParts.length, pParts.length); i++) {
        if (targetParts[i] === pParts[i]) {
          score += 2;
        }
      }
      // Partial segment match
      for (const tp of targetParts) {
        for (const pp of pParts) {
          if (tp && pp && (pp.includes(tp) || tp.includes(pp))) {
            score += 1;
          }
        }
      }

      return { path: p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.path);

  return scored;
}

// ─── Help Rendering ──────────────────────────────────────────────────────────

/**
 * Show API-level help: list all endpoints.
 */
function showApiHelp(apiName: string, baseUrl: string, spec: Record<string, unknown>): void {
  const endpoints = parseSpec(spec);
  const version = getSpecVersion(spec);

  console.log(`${chalk.bold("API:")} ${chalk.cyan(apiName)} (${baseUrl})`);
  console.log(`${chalk.bold("Spec:")} OpenAPI ${version} | ${endpoints.length} endpoints`);
  console.log("");
  console.log(chalk.bold("Endpoints:"));

  // Group by path for clean display
  const byPath = new Map<string, EndpointDef[]>();
  for (const ep of endpoints) {
    const existing = byPath.get(ep.path) || [];
    existing.push(ep);
    byPath.set(ep.path, existing);
  }

  // Find max method width for alignment
  const maxMethodLen = Math.max(...endpoints.map((ep) => ep.method.length));

  for (const [pathStr, eps] of byPath) {
    for (const ep of eps) {
      const method = ep.method.padEnd(maxMethodLen);
      const methodColor =
        ep.method === "GET"
          ? chalk.green(method)
          : ep.method === "POST"
            ? chalk.yellow(method)
            : ep.method === "PUT"
              ? chalk.blue(method)
              : ep.method === "DELETE"
                ? chalk.red(method)
                : chalk.white(method);
      const summary = ep.summary ? chalk.dim(` ${ep.summary}`) : "";
      console.log(`  ${methodColor}  ${pathStr}${summary}`);
    }
  }

  console.log("");
  console.log(chalk.dim(`Usage: oapi x ${apiName} <path> [method] [options]`));
  console.log(chalk.dim(`Help:  oapi x ${apiName} <path> [method] --help`));
}

/**
 * Show endpoint-level help: parameters and usage.
 */
function showEndpointHelp(apiName: string, endpoints: EndpointDef[], targetPath: string): void {
  for (const ep of endpoints) {
    const methodColor =
      ep.method === "GET"
        ? chalk.green(ep.method)
        : ep.method === "POST"
          ? chalk.yellow(ep.method)
          : ep.method === "PUT"
            ? chalk.blue(ep.method)
            : ep.method === "DELETE"
              ? chalk.red(ep.method)
              : chalk.white(ep.method);

    console.log(`${methodColor} ${targetPath}${ep.summary ? chalk.dim(` — ${ep.summary}`) : ""}`);
    if (ep.operationId) {
      console.log(chalk.dim(`  operationId: ${ep.operationId}`));
    }
    console.log("");

    // Path params
    if (ep.pathParams.length > 0) {
      console.log(chalk.bold("Path parameters:"));
      for (const param of ep.pathParams) {
        console.log(`  ${chalk.cyan(param.padEnd(20))} string ${chalk.red("(required)")}`);
      }
      console.log("");
    }

    // Body params
    if (ep.bodySchema) {
      const schema = ep.bodySchema as Record<string, unknown>;

      // Check if it's an array type (e.g., batch endpoints)
      if (schema.type === "array") {
        console.log(chalk.bold("Body:"));
        console.log(`  ${chalk.dim("Type:")} array`);
        const items = schema.items as Record<string, unknown> | undefined;
        if (items) {
          printSchemaProperties(items, "  Item ");
        }
        console.log("");
      } else {
        printSchemaProperties(schema, "Body ");
      }
    }

    // Query params
    if (ep.queryParams.length > 0) {
      console.log(chalk.bold("Query parameters:"));
      for (const qp of ep.queryParams) {
        const reqStr = qp.required ? chalk.red("(required)") : chalk.dim("(optional)");
        const typeStr = qp.enum ? `enum(${qp.enum.join("|")})` : qp.type;
        const desc = qp.description ? chalk.dim(`  ${qp.description}`) : "";
        console.log(`  ${chalk.cyan(qp.name.padEnd(20))} ${typeStr.padEnd(12)} ${reqStr}${desc}`);
      }
      console.log("");
    }

    // Usage example
    const exampleParts = [`oapi x ${apiName} ${targetPath} ${ep.method}`];
    if (ep.bodySchema) {
      const schema = ep.bodySchema as Record<string, unknown>;
      if (schema.type !== "array") {
        const { properties, required } = flattenProperties(schema);
        const reqProps = required.slice(0, 3);
        for (const prop of reqProps) {
          const propSchema = properties[prop] as Record<string, unknown> | undefined;
          const enumVals = propSchema ? extractEnumValues(propSchema) : undefined;
          const example = enumVals ? String(enumVals[0]) : `<${prop}>`;
          exampleParts.push(`-F ${prop}=${example}`);
        }
      } else {
        exampleParts.push("--input data.json");
      }
    }
    console.log(chalk.dim(`Usage: ${exampleParts.join(" ")}`));
    console.log("");
  }
}

/**
 * Print schema properties as a formatted list.
 */
function printSchemaProperties(schema: Record<string, unknown>, prefix: string): void {
  const { properties, required } = flattenProperties(schema);
  const propNames = Object.keys(properties);

  if (propNames.length === 0) return;

  console.log(chalk.bold(`${prefix}parameters:`));
  for (const name of propNames) {
    const propSchema = (properties[name] || {}) as Record<string, unknown>;
    const collapsed = collapseNullable(propSchema);
    const typeStr = getSchemaType(propSchema);
    const isReq = required.includes(name);
    const reqStr = isReq ? chalk.red("(required)") : chalk.dim("(optional)");

    // Description from title or description
    const desc = (collapsed.description as string) || (collapsed.title as string) || "";
    const descStr = desc ? chalk.dim(`  ${desc}`) : "";

    console.log(`  ${chalk.cyan(name.padEnd(20))} ${typeStr.padEnd(20)} ${reqStr}${descStr}`);
  }
  console.log("");
}

// ─── Dry Run ─────────────────────────────────────────────────────────────────

/**
 * Output an equivalent curl command instead of executing.
 */
function printCurlCommand(opts: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}): void {
  const parts: string[] = [`curl -X ${opts.method}`];
  parts.push(`'${opts.url}'`);

  for (const [key, value] of Object.entries(opts.headers)) {
    parts.push(`-H '${key}: ${value}'`);
  }

  if (opts.body !== undefined) {
    parts.push(`-d '${JSON.stringify(opts.body)}'`);
  }

  // Format: first line is curl -X ... 'url', rest are indented with \
  if (parts.length <= 2) {
    console.log(parts.join(" "));
  } else {
    console.log(`${parts[0]} ${parts[1]} \\`);
    for (let i = 2; i < parts.length; i++) {
      const suffix = i < parts.length - 1 ? " \\" : "";
      console.log(`  ${parts[i]}${suffix}`);
    }
  }
}

// ─── Build URL (duplicated from client for dry-run; avoids exporting internals) ─

function buildUrlForDisplay(
  baseUrl: string,
  path: string,
  pathParams?: Record<string, string>,
  queryParams?: Record<string, string>,
): string {
  let resolvedPath = path;
  if (pathParams) {
    for (const [key, value] of Object.entries(pathParams)) {
      resolvedPath = resolvedPath.replace(`{${key}}`, encodeURIComponent(value));
    }
  }

  const base = baseUrl.replace(/\/+$/, "");
  if (!resolvedPath.startsWith("/")) {
    resolvedPath = `/${resolvedPath}`;
  }

  const url = new URL(`${base}${resolvedPath}`);

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

// ─── Command ─────────────────────────────────────────────────────────────────

export const executeCommand = new Command("x")
  .description("Execute an API request")
  .helpOption(false) // We handle --help ourselves for context-aware help
  .argument("<api-name>", "Registered API name")
  .argument("[path]", "API endpoint path")
  .argument("[method]", "HTTP method (GET, POST, PUT, DELETE, PATCH)")
  .option("-F, --field <fields...>", "Typed body/query field (key=value)")
  .option("-f, --raw-field <fields...>", "Raw string field (key=value)")
  .option("-H, --header <headers...>", "Custom header (Key:Value)")
  .option("--input <file>", "Request body from file (- for stdin)")
  .option("--raw", "Output compact JSON")
  .option("--no-validate", "Skip input validation")
  .option("--dry-run", "Show curl command instead of executing")
  .option("--verbose", "Show request/response headers")
  .option("--jq <expr>", "Filter output with jq expression")
  .option("--profile <name>", "Auth profile to use")
  .option("-h, --help", "Show contextual help")
  .allowUnknownOption()
  .action(
    async (
      apiName: string,
      targetPath: string | undefined,
      method: string | undefined,
      options: {
        field?: string[];
        rawField?: string[];
        header?: string[];
        input?: string;
        raw?: boolean;
        validate?: boolean; // --no-validate sets this to false
        dryRun?: boolean;
        verbose?: boolean;
        jq?: string;
        profile?: string;
        help?: boolean;
      },
    ) => {
      try {
        // Load API config
        const api = getApi(apiName);
        if (!api) {
          printError(`API '${apiName}' is not registered. Use 'oapi register' to add it.`);
          process.exit(1);
        }

        // Load cached spec
        const spec = loadSpec(apiName);
        if (!spec) {
          printError(`No cached spec for '${apiName}'. Run 'oapi refresh ${apiName}'.`);
          process.exit(1);
        }

        const endpoints = parseSpec(spec);

        // ─── Help modes ────────────────────────────────────────────

        // Check if "method" is actually a method
        if (method && !HTTP_METHODS.has(method.toUpperCase())) {
          method = undefined;
        }

        // API-level help: oapi x <api> --help (no path provided)
        if (!targetPath || (options.help && !targetPath)) {
          showApiHelp(apiName, api.baseUrl, spec);
          return;
        }

        // Endpoint-level help: oapi x <api> <path> --help
        if (options.help) {
          const matchingEndpoints = findEndpoint(endpoints, targetPath);
          if (matchingEndpoints.length === 0) {
            printError(`Path '${targetPath}' not found in '${apiName}' spec.`);
            process.exit(1);
          }

          // If method specified, filter
          const filtered = method
            ? matchingEndpoints.filter((ep) => ep.method === method?.toUpperCase())
            : matchingEndpoints;

          if (filtered.length === 0) {
            printError(
              `Method ${method?.toUpperCase()} not available for '${targetPath}' in '${apiName}'.`,
            );
            const availableMethods = matchingEndpoints.map((e) => e.method);
            console.error(`Available methods: ${availableMethods.join(", ")}`);
            process.exit(1);
          }

          showEndpointHelp(apiName, filtered, targetPath);
          return;
        }

        // ─── Input handling ────────────────────────────────────────

        // Check mutual exclusivity: --input vs -F/-f
        if (
          options.input &&
          ((options.field && options.field.length > 0) ||
            (options.rawField && options.rawField.length > 0))
        ) {
          printError("--input and -F/-f are mutually exclusive. Use one or the other.");
          process.exit(2);
        }

        // Collect fields (typed + raw merged)
        const typedFields = options.field ? parseTypedFields(options.field) : {};
        const rawFields = options.rawField ? parseRawFields(options.rawField) : {};
        const fields: Record<string, unknown> = { ...rawFields, ...typedFields };

        // ─── Method resolution ─────────────────────────────────────
        // To avoid treating path-param fields as body data, figure out which
        // fields are path params *before* deciding the default method.

        let resolvedMethod = method?.toUpperCase();

        // Find all endpoints that match this path (any method)
        const matchingEndpoints = findEndpoint(endpoints, targetPath);
        if (matchingEndpoints.length === 0) {
          printError(`Path '${targetPath}' not found in '${apiName}' spec.`);
          const suggestions = suggestPaths(endpoints, targetPath);
          if (suggestions.length > 0) {
            console.error(chalk.dim(`Did you mean: ${suggestions.join(", ")}?`));
          }
          console.error(chalk.dim(`Use 'oapi x ${apiName} --help' to see all endpoints.`));
          process.exit(1);
        }

        // Determine which field keys are path params (they'll be consumed later)
        const pathParamNames = new Set(matchingEndpoints[0]?.pathParams ?? []);
        const nonPathFieldCount = Object.keys(fields).filter((k) => !pathParamNames.has(k)).length;
        const hasBodyFields = nonPathFieldCount > 0;

        if (!resolvedMethod) {
          if (matchingEndpoints.length === 1) {
            resolvedMethod = matchingEndpoints[0]?.method;
          } else if (hasBodyFields || options.input) {
            resolvedMethod = "POST";
          } else {
            const hasGet = matchingEndpoints.some((e) => e.method === "GET");
            if (hasGet) {
              resolvedMethod = "GET";
            } else {
              resolvedMethod = matchingEndpoints[0]?.method;
            }
          }
        }

        if (!resolvedMethod) {
          printError(`Could not determine HTTP method for '${targetPath}'.`);
          return process.exit(1);
        }

        // ─── Endpoint matching ─────────────────────────────────────

        const matched = findEndpoint(endpoints, targetPath, resolvedMethod);
        if (matched.length === 0) {
          printError(`Method ${resolvedMethod} not available for '${targetPath}' in '${apiName}'.`);
          const availableMethods = matchingEndpoints.map((e) => e.method);
          if (availableMethods.length > 0) {
            console.error(`Available methods: ${availableMethods.join(", ")}`);
          }
          console.error(
            chalk.dim(`Use 'oapi x ${apiName} ${targetPath} --help' to see available methods.`),
          );
          process.exit(1);
        }

        const endpoint = matched[0];
        if (!endpoint) {
          printError("Unexpected error: no endpoint matched after filtering");
          process.exit(1);
        }

        // ─── Path param substitution ───────────────────────────────

        let pathParams: Record<string, string> = {};
        const requestPath = endpoint.path;

        if (endpoint.path !== targetPath && endpoint.pathParams.length > 0) {
          // Literal path was provided, extract params from it
          pathParams = extractPathParamValues(endpoint.path, targetPath);
        } else {
          // Template path — extract params from fields
          for (const param of endpoint.pathParams) {
            if (fields[param] !== undefined) {
              pathParams[param] = String(fields[param]);
              delete fields[param]; // don't send as body/query too
            }
          }
        }

        // Recalculate after path param extraction
        const hasFields = Object.keys(fields).length > 0;

        // ─── Body from --input ─────────────────────────────────────

        let inputBody: unknown | undefined;
        if (options.input) {
          if (options.input === "-") {
            // Read from stdin
            const chunks: Buffer[] = [];
            const reader = process.stdin;
            for await (const chunk of reader) {
              chunks.push(Buffer.from(chunk as Uint8Array));
            }
            const raw = Buffer.concat(chunks).toString("utf-8").trim();
            try {
              inputBody = JSON.parse(raw);
            } catch {
              printError("Failed to parse stdin as JSON");
              process.exit(2);
            }
          } else {
            // Read from file
            try {
              const raw = fs.readFileSync(options.input, "utf-8");
              inputBody = JSON.parse(raw);
            } catch (e) {
              printError(`Failed to read/parse '${options.input}': ${(e as Error).message}`);
              process.exit(2);
            }
          }
        }

        // ─── Split fields into query vs body ───────────────────────

        let queryParams: Record<string, string> | undefined;
        let body: unknown | undefined;

        const isBodyMethod = ["POST", "PUT", "PATCH"].includes(resolvedMethod);

        if (inputBody !== undefined) {
          body = inputBody;
        } else if (isBodyMethod && hasFields) {
          queryParams = {};
          const bodyFields: Record<string, unknown> = {};

          for (const [key, value] of Object.entries(fields)) {
            const isQueryParam = endpoint.queryParams.some((qp) => qp.name === key);
            if (isQueryParam) {
              queryParams[key] = String(value);
            } else {
              bodyFields[key] = value;
            }
          }

          if (Object.keys(bodyFields).length > 0) {
            body = bodyFields;
          }
          if (Object.keys(queryParams).length === 0) {
            queryParams = undefined;
          }
        } else if (hasFields) {
          // For GET/DELETE, all fields go to query params
          queryParams = {};
          for (const [key, value] of Object.entries(fields)) {
            queryParams[key] = String(value);
          }
        }

        // ─── Validation ────────────────────────────────────────────

        if (options.validate !== false && body !== undefined && endpoint.bodySchema) {
          const result = validateInput(endpoint.bodySchema, body);
          if (!result.valid) {
            printError("Input validation failed:");
            for (const err of result.errors) {
              console.error(chalk.yellow(`  - ${err}`));
            }
            console.error(chalk.dim("\n  Use --no-validate to bypass validation."));
            console.error(
              chalk.dim(
                `  Use 'oapi x ${apiName} ${targetPath} ${resolvedMethod} --help' to see parameters.`,
              ),
            );
            process.exit(2);
          }
        }

        // ─── Build headers ─────────────────────────────────────────

        const headers: Record<string, string> = {
          Accept: "application/json",
        };
        if (body !== undefined) {
          headers["Content-Type"] = "application/json";
        }
        // Apply manual headers first (they take precedence)
        if (options.header) {
          Object.assign(headers, parseHeaders(options.header));
        }

        // ─── Auth resolution ──────────────────────────────────────

        const authProfile = resolveProfile(apiName, options.profile);
        if (authProfile) {
          queryParams = applyAuth(authProfile, headers, queryParams);
        }

        // ─── Dry run ───────────────────────────────────────────────

        if (options.dryRun) {
          const url = buildUrlForDisplay(api.baseUrl, requestPath, pathParams, queryParams);
          printCurlCommand({
            method: resolvedMethod,
            url,
            headers,
            body,
          });
          return;
        }

        // ─── Verbose request info ──────────────────────────────────

        if (options.verbose) {
          const maskedHdrs = maskHeaders(headers);
          console.error(chalk.dim(`> ${resolvedMethod} ${endpoint.path} HTTP/1.1`));
          console.error(chalk.dim(`> Host: ${new URL(api.baseUrl).host}`));
          for (const [key, value] of Object.entries(maskedHdrs)) {
            console.error(chalk.dim(`> ${key}: ${value}`));
          }
          console.error("");
        }

        // ─── Execute request ───────────────────────────────────────

        const response = await executeRequest({
          baseUrl: api.baseUrl,
          path: requestPath,
          method: resolvedMethod,
          headers,
          queryParams,
          pathParams,
          body,
        });

        // Verbose: show response info
        if (options.verbose) {
          console.error(chalk.dim(`< HTTP/1.1 ${response.status}`));
          for (const [key, value] of Object.entries(response.headers)) {
            console.error(chalk.dim(`< ${key}: ${value}`));
          }
          console.error("");
        }

        // ─── Error handling with schema hints ─────────────────────

        if (!response.ok) {
          const status = response.status;
          if (status >= 400 && status < 500) {
            // Extract error message from response body
            const errBody = response.body as Record<string, unknown> | undefined;
            let errMsg = `${status}`;
            if (errBody && typeof errBody === "object") {
              if (errBody.message) errMsg = `${status}: ${errBody.message}`;
              else if (errBody.error) errMsg = `${status}: ${errBody.error}`;
              else if (errBody.detail) errMsg = `${status}: ${errBody.detail}`;
              else errMsg = `${status}`;
            }
            printError(errMsg, errBody);
            console.error(
              chalk.dim(
                `\nHint: Use 'oapi x ${apiName} ${targetPath} ${resolvedMethod} --help' to see all parameters.`,
              ),
            );
          } else {
            // 5xx or other
            if (response.body !== undefined && response.body !== null && response.body !== "") {
              printJson(response.body, { raw: options.raw || !!options.jq });
            }
          }
          process.exit(1);
        }

        // ─── Output response ──────────────────────────────────────

        if (response.body !== undefined && response.body !== null && response.body !== "") {
          if (options.jq) {
            await filterWithJq(response.body, options.jq);
          } else {
            printJson(response.body, { raw: options.raw });
          }
        }
      } catch (error) {
        printError((error as Error).message);
        process.exit(1);
      }
    },
  );
