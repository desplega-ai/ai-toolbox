import { getConfig } from "./config";
import type {
  AgentsResponse,
  TasksResponse,
  LogsResponse,
  Stats,
  AgentWithTasks,
  TaskWithLogs,
} from "../types/api";

class ApiClient {
  private getHeaders(): HeadersInit {
    const config = getConfig();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }
    return headers;
  }

  private getBaseUrl(): string {
    const config = getConfig();
    // In development, use relative URL (proxied by Vite)
    // In production, use configured API URL
    if (import.meta.env.DEV && config.apiUrl === "http://localhost:3013") {
      return "";
    }
    return config.apiUrl;
  }

  async fetchAgents(includeTasks = true): Promise<AgentsResponse> {
    const url = `${this.getBaseUrl()}/api/agents${includeTasks ? "?include=tasks" : ""}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`);
    return res.json();
  }

  async fetchAgent(id: string, includeTasks = true): Promise<AgentWithTasks> {
    const url = `${this.getBaseUrl()}/api/agents/${id}${includeTasks ? "?include=tasks" : ""}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch agent: ${res.status}`);
    return res.json();
  }

  async fetchTasks(filters?: { status?: string; agentId?: string; search?: string }): Promise<TasksResponse> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.agentId) params.set("agentId", filters.agentId);
    if (filters?.search) params.set("search", filters.search);
    const queryString = params.toString();
    const url = `${this.getBaseUrl()}/api/tasks${queryString ? `?${queryString}` : ""}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
    return res.json();
  }

  async fetchTask(id: string): Promise<TaskWithLogs> {
    const url = `${this.getBaseUrl()}/api/tasks/${id}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch task: ${res.status}`);
    return res.json();
  }

  async fetchLogs(limit = 100, agentId?: string): Promise<LogsResponse> {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (agentId) params.set("agentId", agentId);
    const url = `${this.getBaseUrl()}/api/logs?${params.toString()}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch logs: ${res.status}`);
    return res.json();
  }

  async fetchStats(): Promise<Stats> {
    const url = `${this.getBaseUrl()}/api/stats`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
    return res.json();
  }

  async checkHealth(): Promise<{ status: string; version: string }> {
    // Health endpoint is not under /api, so we need to handle it specially
    const config = getConfig();
    const baseUrl = import.meta.env.DEV && config.apiUrl === "http://localhost:3013"
      ? "http://localhost:3013"
      : config.apiUrl;
    const url = `${baseUrl}/health`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json();
  }
}

export const api = new ApiClient();
