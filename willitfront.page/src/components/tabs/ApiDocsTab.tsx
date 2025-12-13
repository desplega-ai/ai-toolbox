import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight, Copy, Check, AlertCircle, Play, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Editor from '@monaco-editor/react';

interface SchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  $ref?: string;
  items?: SchemaProperty;
  anyOf?: SchemaProperty[];
  additionalProperties?: boolean | SchemaProperty;
}

interface Schema {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  items?: SchemaProperty;
}

interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
  };
  paths: Record<string, Record<string, PathOperation>>;
  components?: {
    schemas?: Record<string, Schema>;
  };
}

interface ResponseContent {
  schema?: {
    $ref?: string;
    type?: string;
    additionalProperties?: boolean;
  };
}

interface PathOperation {
  summary: string;
  description: string;
  operationId: string;
  parameters?: Parameter[];
  requestBody?: {
    content: {
      'application/json': {
        schema: { $ref?: string };
      };
    };
  };
  responses: Record<string, {
    description?: string;
    content?: {
      'application/json'?: ResponseContent;
    };
  }>;
}

interface Parameter {
  name: string;
  in: string;
  required: boolean;
  schema: {
    type: string;
    default?: unknown;
    description?: string;
  };
  description?: string;
}

interface EndpointGroup {
  name: string;
  endpoints: Endpoint[];
}

interface Endpoint {
  method: string;
  path: string;
  summary: string;
  description: string;
  parameters: Parameter[];
  hasRequestBody: boolean;
  responseSchemaRef?: string;
}

const METHOD_COLORS: Record<string, string> = {
  get: 'bg-green-100 text-green-700',
  post: 'bg-blue-100 text-blue-700',
  put: 'bg-yellow-100 text-yellow-700',
  delete: 'bg-red-100 text-red-700',
};

function groupEndpoints(spec: OpenApiSpec): EndpointGroup[] {
  const groups: Record<string, Endpoint[]> = {};

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (typeof operation !== 'object' || !operation.summary) continue;

      // Determine group from path
      let groupName: string;
      if (path.startsWith('/dashboard/')) {
        const subPath = path.split('/')[2]; // e.g., 'overview', 'content', etc.
        groupName = `Dashboard - ${subPath.charAt(0).toUpperCase() + subPath.slice(1)}`;
      } else if (path.startsWith('/stats/')) {
        groupName = 'Stats';
      } else if (path.startsWith('/admin/')) {
        groupName = 'Admin';
      } else if (path.startsWith('/top/')) {
        groupName = 'Top';
      } else {
        // Use first path segment as group
        const segment = path.split('/')[1];
        groupName = segment.charAt(0).toUpperCase() + segment.slice(1);
      }

      if (!groups[groupName]) {
        groups[groupName] = [];
      }

      // Extract response schema ref from 200 response
      const successResponse = operation.responses['200'];
      const responseSchemaRef = successResponse?.content?.['application/json']?.schema?.$ref;

      groups[groupName].push({
        method: method.toUpperCase(),
        path,
        summary: operation.summary,
        description: operation.description,
        parameters: operation.parameters || [],
        hasRequestBody: !!operation.requestBody,
        responseSchemaRef,
      });
    }
  }

  // Sort groups with a logical order
  const groupOrder = ['Query', 'Schema', 'Health', 'Stories', 'Comments', 'Jobs', 'Stats', 'Top'];
  const dashboardGroups = Object.keys(groups)
    .filter(g => g.startsWith('Dashboard'))
    .sort();
  const adminGroups = Object.keys(groups).filter(g => g === 'Admin');
  const orderedGroups = [
    ...groupOrder.filter(g => groups[g]),
    ...dashboardGroups,
    ...adminGroups,
  ];

  return orderedGroups.map(name => ({
    name,
    endpoints: groups[name],
  }));
}

function resolveRef(ref: string): string {
  // Convert "#/components/schemas/QueryResponse" to "QueryResponse"
  return ref.replace('#/components/schemas/', '');
}

function getPropertyType(prop: SchemaProperty, schemas: Record<string, Schema>): string {
  if (prop.$ref) {
    return resolveRef(prop.$ref);
  }
  if (prop.anyOf) {
    return prop.anyOf.map(p => getPropertyType(p, schemas)).join(' | ');
  }
  if (prop.type === 'array' && prop.items) {
    const itemType = getPropertyType(prop.items, schemas);
    return `${itemType}[]`;
  }
  if (prop.additionalProperties) {
    return 'object';
  }
  return prop.type || 'unknown';
}

function collectNestedRefs(schema: Schema, schemas: Record<string, Schema>, collected: Set<string>): void {
  const properties = schema.properties || {};
  for (const prop of Object.values(properties)) {
    if (prop.$ref) {
      const refName = resolveRef(prop.$ref);
      if (!collected.has(refName) && schemas[refName]) {
        collected.add(refName);
        collectNestedRefs(schemas[refName], schemas, collected);
      }
    }
    if (prop.items?.$ref) {
      const refName = resolveRef(prop.items.$ref);
      if (!collected.has(refName) && schemas[refName]) {
        collected.add(refName);
        collectNestedRefs(schemas[refName], schemas, collected);
      }
    }
  }
}

function SingleSchemaDisplay({ schemaName, schema }: { schemaName: string; schema: Schema }) {
  const properties = schema.properties || {};
  const required = schema.required || [];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <code className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-semibold">
          {schemaName}
        </code>
        {schema.description && (
          <span className="text-gray-500 text-xs">{schema.description}</span>
        )}
      </div>
      <div className="pl-3 border-l-2 border-gray-200 space-y-1">
        {Object.entries(properties).map(([name, prop]) => (
          <div key={name} className="flex items-start gap-2 text-sm flex-wrap">
            <code className="bg-gray-200 px-1 rounded text-xs">{name}</code>
            <span className="text-purple-600 text-xs">{getPropertyType(prop, {})}</span>
            {required.includes(name) && <span className="text-red-400 text-xs">*</span>}
            {prop.description && (
              <span className="text-gray-500 text-xs">- {prop.description}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface SchemaDisplayProps {
  schemaRef: string;
  schemas: Record<string, Schema>;
}

function SchemaDisplay({ schemaRef, schemas }: SchemaDisplayProps) {
  const schemaName = resolveRef(schemaRef);
  const schema = schemas[schemaName];

  if (!schema) {
    return <span className="text-gray-400">Unknown schema: {schemaName}</span>;
  }

  // Collect all nested schema refs
  const nestedRefs = new Set<string>();
  collectNestedRefs(schema, schemas, nestedRefs);

  return (
    <div className="space-y-4">
      <SingleSchemaDisplay schemaName={schemaName} schema={schema} />
      {Array.from(nestedRefs).map(refName => {
        const nestedSchema = schemas[refName];
        if (!nestedSchema) return null;
        return (
          <SingleSchemaDisplay key={refName} schemaName={refName} schema={nestedSchema} />
        );
      })}
    </div>
  );
}

function JsonViewer({ value }: { value: string }) {
  // Calculate height based on line count (max 400px)
  const lineCount = value.split('\n').length;
  const height = Math.min(Math.max(lineCount * 19 + 10, 100), 400);

  return (
    <div className="border rounded overflow-hidden">
      <Editor
        height={`${height}px`}
        defaultLanguage="json"
        value={value}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: 'off',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          folding: true,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            alwaysConsumeMouseWheel: false,
          },
        }}
        theme="vs"
      />
    </div>
  );
}

interface TryItOutModalProps {
  endpoint: Endpoint;
  baseUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function TryItOutModal({ endpoint, baseUrl, open, onOpenChange }: TryItOutModalProps) {
  // Initialize params with defaults
  const getInitialParams = () => {
    const params: Record<string, string> = {};
    endpoint.parameters.forEach(p => {
      if (p.in === 'query') {
        params[p.name] = p.schema.default !== undefined ? String(p.schema.default) : '';
      }
    });
    return params;
  };

  const getInitialBody = () => {
    if (endpoint.method === 'POST' && endpoint.path === '/query') {
      return JSON.stringify({ sql: 'SELECT * FROM hn LIMIT 5' }, null, 2);
    }
    if (endpoint.method === 'POST') {
      return '{}';
    }
    return '';
  };

  const [params, setParams] = useState<Record<string, string>>(getInitialParams);
  const [body, setBody] = useState(getInitialBody);
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timing, setTiming] = useState<number | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setParams(getInitialParams());
      setBody(getInitialBody());
      setResponse(null);
      setError(null);
      setTiming(null);
      setStatusCode(null);
    }
  }, [open]);

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    setTiming(null);
    setStatusCode(null);

    const start = performance.now();

    try {
      let url = `${baseUrl}${endpoint.path}`;

      // Add query params
      const queryParams = Object.entries(params)
        .filter(([_, value]) => value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      if (queryParams) url += `?${queryParams}`;

      const options: RequestInit = {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
      };

      if (endpoint.method === 'POST' && body) {
        options.body = body;
      }

      const res = await fetch(url, options);
      const elapsed = performance.now() - start;
      const data = await res.json();

      setStatusCode(res.status);
      setTiming(elapsed);
      setResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const queryParams = endpoint.parameters.filter(p => p.in === 'query');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${METHOD_COLORS[endpoint.method.toLowerCase()] || 'bg-gray-100'}`}>
              {endpoint.method}
            </span>
            <code className="text-sm font-mono">{endpoint.path}</code>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* Query Parameters */}
          {queryParams.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Parameters</h4>
              <div className="space-y-2">
                {queryParams.map(param => (
                  <div key={param.name} className="flex items-center gap-2">
                    <label className="w-32 text-sm text-gray-600 shrink-0">
                      {param.name}
                      {param.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      value={params[param.name] || ''}
                      onChange={(e) => setParams(prev => ({ ...prev, [param.name]: e.target.value }))}
                      placeholder={param.description || param.schema.type}
                      className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-[var(--hn-orange)]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Request Body */}
          {endpoint.method === 'POST' && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Request Body</h4>
              <div className="border rounded overflow-hidden">
                <Editor
                  height="120px"
                  defaultLanguage="json"
                  value={body}
                  onChange={(v) => setBody(v || '')}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12,
                    lineNumbers: 'off',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    tabSize: 2,
                  }}
                  theme="vs"
                />
              </div>
            </div>
          )}

          {/* Execute Button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleExecute}
              disabled={loading}
              className="bg-[var(--hn-orange)] hover:bg-orange-600"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin mr-2" />
              ) : (
                <Play size={16} className="mr-2" />
              )}
              Execute
            </Button>
            {timing !== null && (
              <span className="text-sm text-gray-500">
                {statusCode && (
                  <span className={statusCode >= 400 ? 'text-red-500' : 'text-green-600'}>
                    {statusCode}
                  </span>
                )}
                {' '}&middot; {timing.toFixed(0)}ms
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-red-500 text-sm bg-red-50 p-3 rounded flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Response */}
          {response && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Response</h4>
              <JsonViewer value={response} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function generateCurl(endpoint: Endpoint, baseUrl: string): string {
  const url = `${baseUrl}${endpoint.path}`;

  if (endpoint.method === 'GET') {
    const params = endpoint.parameters
      .filter(p => p.in === 'query' && p.schema.default !== undefined)
      .map(p => `${p.name}=${p.schema.default}`)
      .join('&');
    const fullUrl = params ? `${url}?${params}` : url;
    return `curl "${fullUrl}"`;
  }

  if (endpoint.method === 'POST' && endpoint.path === '/query') {
    return `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -d '{"sql": "SELECT * FROM hn LIMIT 10"}'`;
  }

  return `curl -X ${endpoint.method} "${url}"`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-gray-200 rounded transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-gray-500" />}
    </button>
  );
}

function EndpointCard({ endpoint, baseUrl, schemas }: { endpoint: Endpoint; baseUrl: string; schemas: Record<string, Schema> }) {
  const [expanded, setExpanded] = useState(false);
  const [tryItOpen, setTryItOpen] = useState(false);
  const curl = generateCurl(endpoint, baseUrl);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${METHOD_COLORS[endpoint.method.toLowerCase()] || 'bg-gray-100'}`}>
          {endpoint.method}
        </span>
        <code className="text-sm font-mono flex-1">{endpoint.path}</code>
        <span className="text-gray-500 text-sm hidden sm:block">{endpoint.summary}</span>
      </button>

      {expanded && (
        <div className="border-t bg-gray-50 p-3 space-y-3">
          <p className="text-sm text-gray-600">{endpoint.description}</p>

          {endpoint.parameters.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Parameters</h4>
              <div className="space-y-1">
                {endpoint.parameters.map(param => (
                  <div key={param.name} className="flex items-start gap-2 text-sm flex-wrap">
                    <code className="bg-gray-200 px-1 rounded text-xs">{param.name}</code>
                    <span className="text-gray-400">({param.schema.type})</span>
                    {param.required && <span className="text-red-500 text-xs">required</span>}
                    {param.description && <span className="text-gray-600">- {param.description}</span>}
                    {param.schema.default !== undefined && (
                      <span className="text-gray-400">default: {String(param.schema.default)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {endpoint.responseSchemaRef && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Response</h4>
              <SchemaDisplay schemaRef={endpoint.responseSchemaRef} schemas={schemas} />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-semibold text-gray-500 uppercase">Example</h4>
              <CopyButton text={curl} />
            </div>
            <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto">
              {curl}
            </pre>
          </div>

          <Button
            onClick={() => setTryItOpen(true)}
            variant="outline"
            size="sm"
            className="mt-2"
          >
            <Play size={14} className="mr-1.5" />
            Try it out
          </Button>

          <TryItOutModal
            endpoint={endpoint}
            baseUrl={baseUrl}
            open={tryItOpen}
            onOpenChange={setTryItOpen}
          />
        </div>
      )}
    </div>
  );
}

function GroupSection({ group, baseUrl, schemas }: { group: EndpointGroup; baseUrl: string; schemas: Record<string, Schema> }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-gray-50 transition-colors p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="text-base flex items-center gap-2">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          {group.name}
          <span className="text-gray-400 font-normal text-sm">({group.endpoints.length})</span>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="p-4 pt-0 space-y-2">
          {group.endpoints.map(endpoint => (
            <EndpointCard
              key={`${endpoint.method}-${endpoint.path}`}
              endpoint={endpoint}
              baseUrl={baseUrl}
              schemas={schemas}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export function ApiDocsTab() {
  const [spec, setSpec] = useState<OpenApiSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSpec() {
      try {
        const response = await fetch('/api/openapi');
        if (!response.ok) throw new Error('Failed to fetch API spec');
        const data = await response.json();
        setSpec(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchSpec();
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--hn-orange)]" />
      </div>
    );
  }

  if (error || !spec) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-2" />
          <p className="text-red-600">Failed to load API documentation</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const groups = groupEndpoints(spec);
  const schemas = spec.components?.schemas || {};
  const baseUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:3123'
    : 'https://api.willitfront.page';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{spec.info.title}</h1>
            <p className="text-gray-500">{spec.info.description}</p>
            <p className="text-sm text-gray-400 mt-1">Version {spec.info.version} | Base URL: <code className="bg-gray-100 px-1 rounded">{baseUrl}</code></p>
          </div>

          <div className="space-y-4">
            {groups.map(group => (
              <GroupSection key={group.name} group={group} baseUrl={baseUrl} schemas={schemas} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
