export interface ApiEntry {
  source: "local" | "remote";
  url?: string; // remote URL for spec
  path?: string; // absolute local path
  baseUrl: string; // API base URL for requests
  lastRefreshed: string; // ISO 8601
}

export interface Profile {
  type: "header" | "bearer" | "basic" | "query";
  headerName?: string; // for type: "header" (default: "Authorization")
  queryParam?: string; // for type: "query"
  value: string;
}

export interface OapiConfig {
  apis: Record<string, ApiEntry>;
  profiles: Record<string, Profile>;
  defaults: Record<string, string>; // api name -> default profile name
}

export const DEFAULT_CONFIG: OapiConfig = {
  apis: {},
  profiles: {},
  defaults: {},
};
