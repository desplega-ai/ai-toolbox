# Hive Phase 10: Analytics - Persist Result Messages

## Overview

Persist result messages with cost/duration/usage data as they arrive from the Claude SDK, so analytics are available when restoring sessions.

## Problem

1. **During live sessions**: Claude SDK sends result messages with full analytics (`total_cost_usd`, `duration_ms`, `duration_api_ms`, `num_turns`, `usage`)
2. **On reload**: Claude SDK's JSONL files don't contain result messages - only `user` and `assistant` messages
3. **Current workaround**: We synthesize result messages from assistant message usage, but this loses cost/duration data

## Solution

Store result messages in Hive's SQLite database as they arrive. On session restore, merge our persisted result messages with the SDK's JSONL history. Fall back to synthesized results for any gaps.

## Files to Modify

1. `hive/src/main/database.ts` - Add `session_results` table
2. `hive/src/main/session-manager.ts` - Save result messages as they arrive
3. `hive/src/main/session-history.ts` - Merge persisted results when loading history
4. `hive/src/main/ipc-handlers.ts` - Update handler to pass persisted results

## Implementation

### Phase 1: Database Schema

**File**: `hive/src/main/database.ts`

Add new table after existing schema:

```sql
CREATE TABLE IF NOT EXISTS session_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  claude_session_id TEXT NOT NULL,
  subtype TEXT NOT NULL,
  timestamp TEXT,
  result TEXT,
  total_cost_usd REAL,
  duration_ms INTEGER,
  duration_api_ms INTEGER,
  num_turns INTEGER,
  usage_json TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_session_results_session ON session_results(session_id);
CREATE INDEX IF NOT EXISTS idx_session_results_claude_session ON session_results(claude_session_id);
```

Add prepared statements:

```typescript
// Session results
insertSessionResult: db.prepare(`
  INSERT INTO session_results (
    session_id, claude_session_id, subtype, timestamp, result,
    total_cost_usd, duration_ms, duration_api_ms, num_turns, usage_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`),
getSessionResultsByClaudeId: db.prepare(`
  SELECT * FROM session_results WHERE claude_session_id = ? ORDER BY created_at ASC
`),
```

Add database API:

```typescript
sessionResults: {
  insert(data: {
    sessionId: string;
    claudeSessionId: string;
    subtype: string;
    timestamp?: string;
    result?: string;
    totalCostUsd?: number;
    durationMs?: number;
    durationApiMs?: number;
    numTurns?: number;
    usage?: object;
  }): void {
    statements.insertSessionResult.run(
      data.sessionId,
      data.claudeSessionId,
      data.subtype,
      data.timestamp || null,
      data.result || null,
      data.totalCostUsd ?? null,
      data.durationMs ?? null,
      data.durationApiMs ?? null,
      data.numTurns ?? null,
      data.usage ? JSON.stringify(data.usage) : null
    );
  },

  getByClaudeSessionId(claudeSessionId: string): SDKResultMessage[] {
    const rows = statements.getSessionResultsByClaudeId.all(claudeSessionId) as any[];
    return rows.map(row => ({
      type: 'result' as const,
      subtype: row.subtype,
      session_id: row.claude_session_id,
      timestamp: row.timestamp,
      result: row.result,
      total_cost_usd: row.total_cost_usd,
      duration_ms: row.duration_ms,
      duration_api_ms: row.duration_api_ms,
      num_turns: row.num_turns,
      usage: row.usage_json ? JSON.parse(row.usage_json) : undefined,
    }));
  },
},
```

---

### Phase 2: Persist Result Messages on Arrival

**File**: `hive/src/main/session-manager.ts`

In the message loop (around line 154), add persistence when receiving result messages:

```typescript
// Handle result
if (message.type === 'result') {
  console.log(`[Session] Result received: ${message.subtype}`);

  // Persist result message with analytics data
  const session = database.sessions.getById(hiveSessionId);
  if (session?.claudeSessionId) {
    const resultMsg = message as SDKResultMessage;
    database.sessionResults.insert({
      sessionId: hiveSessionId,
      claudeSessionId: session.claudeSessionId,
      subtype: resultMsg.subtype,
      timestamp: resultMsg.timestamp,
      result: resultMsg.result,
      totalCostUsd: resultMsg.total_cost_usd,
      durationMs: resultMsg.duration_ms,
      durationApiMs: resultMsg.duration_api_ms,
      numTurns: resultMsg.num_turns,
      usage: resultMsg.usage,
    });
  }

  // ... existing status handling code ...
}
```

Also persist interrupted results (around line 192):

```typescript
// Save interrupted result to database
const session = database.sessions.getById(hiveSessionId);
if (session?.claudeSessionId) {
  database.sessionResults.insert({
    sessionId: hiveSessionId,
    claudeSessionId: session.claudeSessionId,
    subtype: 'interrupted',
    timestamp: new Date().toISOString(),
    result: 'Session interrupted by user',
  });
}
```

---

### Phase 3: Merge Persisted Results on History Load

**File**: `hive/src/main/session-history.ts`

Update `loadSessionHistory` to accept persisted results and merge them:

```typescript
export async function loadSessionHistory(
  directory: string,
  claudeSessionId: string,
  persistedResults?: SDKResultMessage[]
): Promise<SDKMessage[]> {
  // ... existing JSONL loading code ...

  // If we have persisted results, merge them instead of synthesizing
  if (persistedResults && persistedResults.length > 0) {
    return mergePersistedResults(messages, persistedResults);
  }

  // Fall back to synthesizing if no persisted results
  return synthesizeResultMessages(messages);
}

/**
 * Merge persisted result messages into the message stream at appropriate positions.
 * Result messages go after the last assistant message before each user message.
 * Falls back to synthesized results for any gaps.
 */
function mergePersistedResults(
  messages: SDKMessage[],
  persistedResults: SDKResultMessage[]
): SDKMessage[] {
  if (persistedResults.length === 0) {
    return synthesizeResultMessages(messages);
  }

  const result: SDKMessage[] = [];
  let resultIndex = 0;
  let lastAssistantTimestamp: string | undefined;

  for (const msg of messages) {
    // Before adding a user message, check if a result should be inserted
    if (msg.type === 'user' && resultIndex < persistedResults.length) {
      const nextResult = persistedResults[resultIndex];
      // Insert result if its timestamp is before this user message
      const userTimestamp = (msg as { timestamp?: string }).timestamp;
      if (nextResult.timestamp && userTimestamp && nextResult.timestamp < userTimestamp) {
        result.push(nextResult);
        resultIndex++;
      } else if (lastAssistantTimestamp && !nextResult.timestamp) {
        // No timestamp on result, insert based on position
        result.push(nextResult);
        resultIndex++;
      }
    }

    result.push(msg);

    if (msg.type === 'assistant') {
      lastAssistantTimestamp = (msg as { timestamp?: string }).timestamp;
    }
  }

  // Add any remaining results at the end
  while (resultIndex < persistedResults.length) {
    result.push(persistedResults[resultIndex]);
    resultIndex++;
  }

  return result;
}
```

---

### Phase 4: IPC Handler Update

**File**: `hive/src/main/ipc-handlers.ts`

Update the `session:load-history` handler to fetch and pass persisted results:

```typescript
ipcMain.handle('session:load-history', async (_, { directory, claudeSessionId }) => {
  // Get persisted result messages from database
  const persistedResults = database.sessionResults.getByClaudeSessionId(claudeSessionId);

  // Load history with persisted results
  return loadSessionHistory(directory, claudeSessionId, persistedResults);
});
```

---

## Success Criteria

### Automated Verification
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [ ] App starts without errors: `cd hive && pnpm start`
- [ ] Database table created: `sqlite3 ~/.hive/hive.db ".schema session_results"`

### Manual Verification
- [ ] Start a session, send a message, see cost/duration in UI
- [ ] Close and reopen app
- [ ] Open the same session - cost/duration still visible
- [ ] Check database: `sqlite3 ~/.hive/hive.db "SELECT * FROM session_results"`

---

## Edge Cases Handled

1. **App closed mid-session**: Falls back to synthesized results (token counts only, no cost/duration)
2. **Session interrupted**: Interrupted result messages are also persisted
3. **Old sessions without persisted results**: Falls back to full synthesis

---

## Future Enhancements (Not in This Phase)

1. **Aggregated analytics view**: Sum costs across sessions/projects
2. **Cost estimation**: Calculate estimated cost before sending
3. **Budget alerts**: Warn when approaching cost limits
4. **Export analytics**: CSV/JSON export of usage data

---

## References

- Related plan: [`2025-12-15-hive-v0.1-foundation-setup.md`](./2025-12-15-hive-v0.1-foundation-setup.md) (Phase 10 listed there)
- Current implementation: `hive/src/main/session-history.ts` (synthesizeResultMessages)
- Result message type: `hive/src/shared/sdk-types.ts:66-82` (SDKResultMessage)
