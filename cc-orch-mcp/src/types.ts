import * as z from "zod";

export const AgentTaskStatusSchema = z.enum(["pending", "in_progress", "completed", "failed"]);

export const AgentTaskSchema = z.object({
  id: z.uuid(),
  agentId: z.uuid(),
  task: z.string().min(1),
  status: AgentTaskStatusSchema,

  createdAt: z.iso.datetime().default(() => new Date().toISOString()),
  lastUpdatedAt: z.iso.datetime().default(() => new Date().toISOString()),

  finishedAt: z.iso.datetime().optional(),

  failureReason: z.string().optional(),
  output: z.string().optional(),
  progress: z.string().optional(),
});

export const AgentStatusSchema = z.enum(["idle", "busy", "offline"]);

export const AgentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  isLead: z.boolean().default(false),
  status: AgentStatusSchema,

  createdAt: z.iso.datetime().default(() => new Date().toISOString()),
  lastUpdatedAt: z.iso.datetime().default(() => new Date().toISOString()),
});

export const AgentWithTasksSchema = AgentSchema.extend({
  tasks: z.array(AgentTaskSchema).default([]),
});

export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;
export type AgentTask = z.infer<typeof AgentTaskSchema>;

export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type AgentWithTasks = z.infer<typeof AgentWithTasksSchema>;

// Agent Log Types
export const AgentLogEventTypeSchema = z.enum([
  "agent_joined",
  "agent_status_change",
  "agent_left",
  "task_created",
  "task_status_change",
  "task_progress",
]);

export const AgentLogSchema = z.object({
  id: z.uuid(),
  eventType: AgentLogEventTypeSchema,
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  oldValue: z.string().optional(),
  newValue: z.string().optional(),
  metadata: z.string().optional(),
  createdAt: z.iso.datetime(),
});

export type AgentLogEventType = z.infer<typeof AgentLogEventTypeSchema>;
export type AgentLog = z.infer<typeof AgentLogSchema>;
