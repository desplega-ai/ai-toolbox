---
date: 2025-12-30T18:00:00Z
researcher: Claude
git_commit: 17a7d06865c06c0cd788888ce0296ad43c604792
branch: main
repository: ai-toolbox
topic: "Hive - Getting Context Window and Thread Summaries from Claude Code"
tags: [research, hive, context-window, summaries, acp, claude-sdk, tokens]
status: complete
last_updated: 2025-12-30
last_updated_by: Claude
related: ["2025-12-29-hive-acp-integration.md"]
---

# Research: Hive - Getting Context Window and Thread Summaries from Claude Code

**Date**: 2025-12-30T18:00:00Z
**Researcher**: Claude
**Git Commit**: 17a7d06865c06c0cd788888ce0296ad43c604792
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How can Hive get information about context window usage and thread summaries from Claude Code sessions via ACP?

## Summary

**Key Finding**: The Agent Client Protocol (ACP) does NOT standardize token usage or context window metrics. This data must come from the agent (Claude Code) via extension mechanisms or external sources.

**Current State**:
- Hive's UI has `ContextUsageBar` and `AnalyticsTab` that expect `SDKModelUsage.contextWindow` and token data
- The new `ACPSessionManager` does not receive or forward this data (lines 415-423, 565-574 create `SDKResultMessage` without `usage`/`modelUsage`)
- The ACP protocol's `_meta` field is the intended extension point for custom metrics
- Thread summaries exist via `/compact` but are not exposed programmatically

**Options Available**:

| Data Type | Source | Implementation Effort |
|-----------|--------|----------------------|
| Context Window | JSONL transcript files | Medium - parse `~/.claude/projects/` |
| Token Usage | JSONL transcript files | Medium - aggregate from message `usage` fields |
| Token Usage | ACP `_meta` extension | Low - if claude-code-acp adds it |
| Thread Summaries | JSONL after `/compact` | Medium - parse compact_boundary messages |
| Thread Summaries | None available | N/A - no programmatic API exists |

## Detailed Findings

### 1. ACP Protocol Limitations

**Source**: `@agentclientprotocol/sdk` type definitions and documentation

The ACP protocol focuses on **communication mechanics**, not **observability/metrics**. It does NOT provide:

- Token usage statistics
- Context window size or usage
- Cost tracking
- Conversation summaries

**Available Data**:
```typescript
// PromptResponse - only has stopReason
type PromptResponse = {
  _meta?: { [key: string]: unknown };  // Extension point
  stopReason: StopReason;  // "end_turn" | "max_tokens" | "cancelled"
};

// SessionInfo - basic metadata only
type SessionInfo = {
  sessionId: string;
  cwd: string;
  title?: string;
  updatedAt?: string;
  _meta?: { [key: string]: unknown };  // Extension point
};
```

**Extensibility**: The `_meta` field on every ACP type is the official mechanism for custom data. Claude Code could potentially send:
```typescript
_meta: {
  tokenUsage: {
    input: 1500,
    output: 3200,
    contextWindow: 200000,
    contextUsed: 4700
  }
}
```

### 2. Current Hive UI Expectations

**File**: `hive/src/renderer/components/views/SessionView.tsx`

The UI already has components expecting this data:

```typescript
// Lines 38-73: ContextUsage interface
interface ContextUsage {
  current: number;
  max: number;
  systemTokens: number;
  conversationTokens: number;
}

// Lines 63-67: Extracts contextWindow from modelUsage
if (resultMsg.modelUsage) {
  const models = Object.values(resultMsg.modelUsage);
  if (models.length > 0 && models[0].contextWindow > 0) {
    max = models[0].contextWindow;
  }
}
```

**Components**:
- `ContextUsageBar` (lines 77-119) - Visual bar showing context usage
- `AnalyticsTab` (lines 1535-1689) - Token breakdown display
- `UsageStats` in `MessageList.tsx` (lines 92-112) - Per-message token display

### 3. Gap in ACPSessionManager

**File**: `hive/src/main/acp-session-manager.ts`

The current implementation creates `SDKResultMessage` without token data:

```typescript
// Lines 415-423 (follow-up) and 565-574 (new session)
const resultMessage: SDKResultMessage = {
  type: 'result',
  subtype: response.stopReason === 'end_turn' ? 'success' : 'error_during_execution',
  session_id: acpSessionId,
  result: response.stopReason === 'end_turn' ? 'Completed' : `Stopped: ${response.stopReason}`,
  timestamp: new Date().toISOString(),
  duration_ms: Date.now() - promptStartTime,
  num_turns: existingActive.turnCount,
  // MISSING: usage, modelUsage, total_cost_usd, duration_api_ms
};
```

### 4. Claude SDK Data (What Was Available)

The old session manager using `@anthropic-ai/claude-agent-sdk` received:

```typescript
// SDKResultMessage with full usage data
type SDKResultMessage = {
  type: 'result';
  subtype: 'success';
  session_id: string;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  modelUsage: {
    [modelName: string]: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      webSearchRequests: number;
      costUSD: number;
      contextWindow: number;  // The context window size!
    };
  };
};
```

### 5. JSONL Transcript Files

**Location**: `~/.claude/projects/{project-slug}/{session-id}.jsonl`

Claude Code stores full conversation history in JSONL format. Each line contains:

```json
{
  "parentUuid": "...",
  "sessionId": "...",
  "type": "user" | "assistant",
  "message": {
    "role": "...",
    "content": "...",
    "usage": {
      "input_tokens": 1234,
      "output_tokens": 567
    }
  },
  "uuid": "...",
  "timestamp": "...",
  "cwd": "...",
  "gitBranch": "..."
}
```

**Compact Boundary Messages** (when `/compact` is used):
```json
{
  "type": "system",
  "subtype": "compact_boundary",
  "compact_metadata": {
    "trigger": "manual" | "auto",
    "pre_tokens": 150000
  }
}
```

### 6. Thread Summaries

**Current State**: No programmatic API exists for conversation summaries.

**Available Mechanisms**:

1. **`/compact` Command**: Creates internal summary but not exposed via API
   - Auto-triggers at 95% context capacity (as of v2.0.64)
   - Can be customized: `/compact Focus on authentication logic`

2. **`/context` Command**: Shows token breakdown in CLI, not exposed via API

3. **Feature Request**: [GitHub Issue #6907](https://github.com/anthropics/claude-code/issues/6907) - Auto-generate session summaries

4. **Historical Messages**: [GitHub Issue #14](https://github.com/anthropics/claude-agent-sdk-typescript/issues/14) - When resuming sessions, old messages are NOT streamed back

### 7. Community Tools for JSONL Parsing

Several tools exist for parsing Claude Code transcripts:

- [claude-code-transcripts](https://github.com/simonw/claude-code-transcripts) - Convert to HTML
- [claude-history](https://github.com/thejud/claude-history) - Extract to markdown
- [claude-code-log](https://github.com/daaain/claude-code-log) - JSONL to HTML
- [claude-JSONL-browser](https://github.com/withLinda/claude-JSONL-browser) - Web-based viewer

## Options for Implementation

### Option A: Parse JSONL Transcript Files

**How**: Read `~/.claude/projects/{slug}/{session-id}.jsonl` to extract:
- Token usage from message `usage` fields
- Context size from accumulated tokens
- Summaries from compact_boundary messages

**Pros**:
- Full data available
- No changes to claude-code-acp needed
- Can get historical context

**Cons**:
- File I/O overhead
- Need to map Hive session IDs to Claude session IDs
- Parsing complexity

**Implementation**:
```typescript
// New: src/main/transcript-parser.ts
export function parseTranscript(sessionId: string): TranscriptData {
  const basePath = path.join(os.homedir(), '.claude', 'projects');
  // Find matching .jsonl file by session ID
  // Parse each line for usage data
  // Aggregate totals
}
```

### Option B: Request claude-code-acp Updates

**How**: Open issue/PR on [claude-code-acp](https://github.com/zed-industries/claude-code-acp) to:
- Forward usage data from SDK messages via `_meta` field
- Include contextWindow in session updates

**Pros**:
- Clean integration
- Standard ACP extension mechanism

**Cons**:
- Dependency on external maintainers
- Unknown timeline

### Option C: Hybrid - Track Client-Side + JSONL Fallback

**How**:
1. Estimate tokens from message content lengths (rough approximation)
2. Use model-specific context window constants (200k for Opus, 200k for Sonnet, 200k for Haiku)
3. Read JSONL periodically for accurate totals

**Pros**:
- Real-time estimates available
- Accurate data on session end

**Cons**:
- Estimates may be inaccurate
- Complex implementation

### Option D: Wait for ACP Protocol Updates

**How**: Monitor ACP specification for observability additions

**Status**: No known timeline for usage metrics in ACP

## Recommended Approach

**Short-term (Immediate)**:
1. Use model-specific context window constants for UI display
2. Track approximate token usage from message content

**Medium-term**:
1. Implement JSONL transcript parser for accurate post-session analytics
2. Read transcript on session idle/finish to update analytics

**Long-term**:
1. Request claude-code-acp to expose usage via `_meta`
2. Monitor ACP spec for observability additions

## Code References

| Component | Path | Lines |
|-----------|------|-------|
| ACP Session Manager | `hive/src/main/acp-session-manager.ts` | 415-423, 565-574 |
| Context Usage Bar | `hive/src/renderer/components/views/SessionView.tsx` | 38-119 |
| Analytics Tab | `hive/src/renderer/components/views/SessionView.tsx` | 1471-1689 |
| SDK Types | `hive/src/shared/sdk-types.ts` | 16-95 |
| Message Usage Display | `hive/src/renderer/components/session/MessageList.tsx` | 61-112 |
| Global Analytics | `hive/src/renderer/components/views/GlobalAnalyticsModal.tsx` | All |

## External Resources

**Documentation**:
- [Claude Code Slash Commands](https://code.claude.com/docs/en/slash-commands)
- [Claude Agent SDK TypeScript](https://platform.claude.com/docs/en/api/agent-sdk/typescript)
- [ACP Protocol Overview](https://agentclientprotocol.com/protocol/overview)

**Repositories**:
- [claude-code-acp](https://github.com/zed-industries/claude-code-acp)
- [claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript)

**Feature Requests**:
- [Issue #6907 - Auto-generate session summaries](https://github.com/anthropics/claude-code/issues/6907)
- [Issue #14 - API to retrieve historical messages](https://github.com/anthropics/claude-agent-sdk-typescript/issues/14)

## Related Research

- [2025-12-29-hive-acp-integration.md](./2025-12-29-hive-acp-integration.md) - ACP integration research
