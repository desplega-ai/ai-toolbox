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
