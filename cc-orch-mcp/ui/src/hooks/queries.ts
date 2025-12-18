import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { AgentWithTasks } from "../types/api";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.fetchAgents(true),
    select: (data) => data.agents as AgentWithTasks[],
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.fetchAgent(id),
    enabled: !!id,
  });
}

export function useTasks(status?: string) {
  return useQuery({
    queryKey: ["tasks", status],
    queryFn: () => api.fetchTasks(status),
    select: (data) => data.tasks,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ["task", id],
    queryFn: () => api.fetchTask(id),
    enabled: !!id,
  });
}

export function useLogs(limit = 50) {
  return useQuery({
    queryKey: ["logs", limit],
    queryFn: () => api.fetchLogs(limit),
    select: (data) => data.logs,
  });
}

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => api.fetchStats(),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api.checkHealth(),
    refetchInterval: 10000, // Check every 10 seconds
    retry: 2,
    retryDelay: 1000,
  });
}
