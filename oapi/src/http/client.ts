export interface RequestOptions {
  baseUrl: string;
  path: string;
  method: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  pathParams?: Record<string, string>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  ok: boolean;
}

/**
 * Substitute {param} placeholders in a path with actual values.
 */
function substitutePath(path: string, params: Record<string, string>): string {
  let result = path;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`{${key}}`, encodeURIComponent(value));
  }
  return result;
}

/**
 * Build the full URL from base + path + query params.
 */
function buildUrl(
  baseUrl: string,
  path: string,
  pathParams?: Record<string, string>,
  queryParams?: Record<string, string>,
): string {
  // Substitute path params
  let resolvedPath = pathParams ? substitutePath(path, pathParams) : path;

  // Normalize: ensure base doesn't end with / and path starts with /
  const base = baseUrl.replace(/\/+$/, "");
  if (!resolvedPath.startsWith("/")) {
    resolvedPath = `/${resolvedPath}`;
  }

  const url = new URL(`${base}${resolvedPath}`);

  // Append query params
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

/**
 * Execute an HTTP request and return the response.
 */
export async function executeRequest(options: RequestOptions): Promise<ApiResponse> {
  const url = buildUrl(options.baseUrl, options.path, options.pathParams, options.queryParams);

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  // Set Content-Type for requests with body
  if (options.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const fetchOptions: RequestInit = {
    method: options.method.toUpperCase(),
    headers,
  };

  if (options.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);

  // Parse response headers
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  // Parse body — try JSON first, fallback to text
  let body: unknown;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
  } else {
    const text = await response.text();
    // Try to parse as JSON anyway (some APIs don't set content-type properly)
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return {
    status: response.status,
    headers: responseHeaders,
    body,
    ok: response.ok,
  };
}
