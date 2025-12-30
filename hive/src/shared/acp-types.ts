// Types to bridge ACP protocol to existing UI types
import type * as acp from '@agentclientprotocol/sdk';

// Re-export commonly used ACP types
export type {
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ToolCall,
  StopReason,
} from '@agentclientprotocol/sdk';

// Permission outcome mapping
export type PermissionOutcome = 'allow' | 'deny' | 'cancelled';

// Tool status from ACP
export type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

// Re-export the acp namespace for convenience
export type { acp };
