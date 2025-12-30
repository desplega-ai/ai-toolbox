import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import type { SDKMessage, SDKUsage, SDKAssistantMessage, SDKResultMessage, SDKModelUsage } from '../shared/sdk-types';

const CLAUDE_DIR = path.join(app.getPath('home'), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

/**
 * Convert a directory path to the Claude SDK's encoded folder name.
 * e.g., /Users/taras/Documents/code/cc -> -Users-taras-Documents-code-cc
 */
function encodeProjectPath(directory: string): string {
  return directory.replace(/[/.]/g, '-');
}

/**
 * Get the path to a session's JSONL file.
 */
export function getSessionFilePath(directory: string, claudeSessionId: string): string {
  const encodedPath = encodeProjectPath(directory);
  return path.join(PROJECTS_DIR, encodedPath, `${claudeSessionId}.jsonl`);
}

/**
 * Parse a JSONL message line into our SDKMessage format.
 */
function parseJsonlMessage(line: string): SDKMessage | null {
  try {
    const parsed = JSON.parse(line);

    // Convert to our SDKMessage format
    if (parsed.type === 'user') {
      return {
        type: 'user',
        session_id: parsed.sessionId,
        uuid: parsed.uuid,
        timestamp: parsed.timestamp,
        message: parsed.message,
      } as SDKMessage;
    } else if (parsed.type === 'assistant') {
      return {
        type: 'assistant',
        uuid: parsed.uuid,
        session_id: parsed.sessionId,
        timestamp: parsed.timestamp,
        message: parsed.message,
      } as SDKMessage;
    } else if (parsed.type === 'result') {
      return {
        type: 'result',
        subtype: parsed.subtype,
        session_id: parsed.sessionId,
        timestamp: parsed.timestamp,
        result: parsed.result,
        total_cost_usd: parsed.costUSD,
        duration_ms: parsed.durationMs,
        duration_api_ms: parsed.durationApiMs,
        num_turns: parsed.numTurns,
        usage: parsed.usage,
      } as SDKMessage;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Synthesize result messages from assistant message usage data.
 * Claude SDK doesn't persist result messages to JSONL, so we create them
 * by aggregating usage from assistant messages at each turn boundary.
 */
function synthesizeResultMessages(messages: SDKMessage[]): SDKMessage[] {
  const result: SDKMessage[] = [];
  let turnUsage: SDKUsage = {};
  let lastTimestamp: string | undefined;
  let lastSessionId: string | undefined;
  let hasUsageData = false;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // At start of new user message (after we've accumulated assistant usage), insert synthetic result
    if (msg.type === 'user' && hasUsageData) {
      result.push({
        type: 'result',
        subtype: 'success',
        session_id: lastSessionId,
        timestamp: lastTimestamp,
        usage: turnUsage,
      } as SDKMessage);
      turnUsage = {};
      hasUsageData = false;
    }

    result.push(msg);

    if (msg.type === 'assistant') {
      const assistantMsg = msg as SDKAssistantMessage;
      const usage = assistantMsg.message?.usage;
      if (usage) {
        turnUsage.input_tokens = (turnUsage.input_tokens || 0) + (usage.input_tokens || 0);
        turnUsage.output_tokens = (turnUsage.output_tokens || 0) + (usage.output_tokens || 0);
        turnUsage.cache_creation_input_tokens = (turnUsage.cache_creation_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
        turnUsage.cache_read_input_tokens = (turnUsage.cache_read_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
        hasUsageData = true;
      }
      lastTimestamp = assistantMsg.timestamp;
      lastSessionId = assistantMsg.session_id;
    }
  }

  // Don't forget the final turn if it ended with assistant messages
  if (hasUsageData) {
    result.push({
      type: 'result',
      subtype: 'success',
      session_id: lastSessionId,
      timestamp: lastTimestamp,
      usage: turnUsage,
    } as SDKMessage);
  }

  return result;
}

/**
 * Load session history from the Claude SDK's JSONL file.
 * Returns an array of messages in chronological order.
 *
 * If persistedResults are provided (from Hive's database), they are merged
 * into the message stream instead of synthesizing from assistant usage data.
 */
export async function loadSessionHistory(
  directory: string,
  claudeSessionId: string,
  persistedResults?: SDKResultMessage[]
): Promise<SDKMessage[]> {
  const filePath = getSessionFilePath(directory, claudeSessionId);

  if (!fs.existsSync(filePath)) {
    console.log(`Session file not found: ${filePath}`);
    return [];
  }

  const messages: SDKMessage[] = [];

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      const message = parseJsonlMessage(line);
      if (message) {
        messages.push(message);
      }
    }
  }

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

/**
 * Check if a session file exists.
 */
export function sessionFileExists(directory: string, claudeSessionId: string): boolean {
  const filePath = getSessionFilePath(directory, claudeSessionId);
  return fs.existsSync(filePath);
}

/**
 * List all session IDs for a project directory.
 */
export function listProjectSessions(directory: string): string[] {
  const encodedPath = encodeProjectPath(directory);
  const projectDir = path.join(PROJECTS_DIR, encodedPath);

  if (!fs.existsSync(projectDir)) {
    return [];
  }

  const files = fs.readdirSync(projectDir);
  return files
    .filter(f => f.endsWith('.jsonl'))
    .map(f => f.replace('.jsonl', ''));
}

/**
 * Get metadata about a session from its first few lines.
 */
export function getSessionMetadata(directory: string, claudeSessionId: string): {
  firstPrompt: string | null;
  timestamp: string | null;
} | null {
  const filePath = getSessionFilePath(directory, claudeSessionId);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length === 0) {
      return null;
    }

    // Find first user message
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'user' && parsed.message?.content) {
          const textBlock = parsed.message.content.find((b: { type: string }) => b.type === 'text');
          return {
            firstPrompt: textBlock?.text?.slice(0, 100) || null,
            timestamp: parsed.timestamp || null,
          };
        }
      } catch {
        continue;
      }
    }

    return { firstPrompt: null, timestamp: null };
  } catch {
    return null;
  }
}

/**
 * Discover all sessions for a project directory with their metadata.
 */
export function discoverProjectSessions(directory: string): Array<{
  claudeSessionId: string;
  firstPrompt: string | null;
  timestamp: string | null;
}> {
  const sessionIds = listProjectSessions(directory);

  return sessionIds
    .map(claudeSessionId => {
      const metadata = getSessionMetadata(directory, claudeSessionId);
      return {
        claudeSessionId,
        firstPrompt: metadata?.firstPrompt || null,
        timestamp: metadata?.timestamp || null,
      };
    })
    .filter(s => s.firstPrompt !== null) // Skip empty sessions
    .sort((a, b) => {
      // Sort by timestamp descending (newest first)
      if (a.timestamp && b.timestamp) {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
      return 0;
    });
}

/**
 * Get all files that were written or edited during a session.
 * Extracts file paths from Write and Edit tool calls in assistant messages.
 * Returns relative paths (strips the project directory prefix).
 */
export async function getSessionWrittenFiles(
  projectDirectory: string,
  claudeSessionId: string
): Promise<string[]> {
  const filePath = getSessionFilePath(projectDirectory, claudeSessionId);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const writtenFiles = new Set<string>();

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line);

      // Only process assistant messages
      if (parsed.type !== 'assistant') continue;

      const content = parsed.message?.content;
      if (!Array.isArray(content)) continue;

      // Find tool_use blocks for Write and Edit tools
      for (const block of content) {
        if (block.type !== 'tool_use') continue;
        if (block.name !== 'Write' && block.name !== 'Edit') continue;

        const filePath = block.input?.file_path;
        if (typeof filePath !== 'string') continue;

        // Convert absolute path to relative path
        let relativePath = filePath;
        if (filePath.startsWith(projectDirectory)) {
          relativePath = filePath.slice(projectDirectory.length);
          // Remove leading slash
          if (relativePath.startsWith('/')) {
            relativePath = relativePath.slice(1);
          }
        }

        if (relativePath) {
          writtenFiles.add(relativePath);
        }
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return Array.from(writtenFiles);
}

/**
 * Extract cumulative token usage from a session's JSONL file.
 * Reads all assistant messages and sums their usage data.
 * Returns null if file doesn't exist or no usage data found.
 */
export async function extractSessionUsage(
  directory: string,
  claudeSessionId: string
): Promise<{
  usage: SDKUsage;
  modelUsage: { [modelName: string]: SDKModelUsage };
} | null> {
  const filePath = getSessionFilePath(directory, claudeSessionId);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const usage: SDKUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  // Track per-model usage
  const modelUsageMap = new Map<string, SDKModelUsage>();

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line);

      // Extract usage from assistant messages
      if (parsed.type === 'assistant' && parsed.message?.usage) {
        const msgUsage = parsed.message.usage;
        usage.input_tokens! += msgUsage.input_tokens || 0;
        usage.output_tokens! += msgUsage.output_tokens || 0;
        usage.cache_creation_input_tokens! += msgUsage.cache_creation_input_tokens || 0;
        usage.cache_read_input_tokens! += msgUsage.cache_read_input_tokens || 0;

        // Track model usage if model info available
        const model = parsed.message.model;
        if (model) {
          if (!modelUsageMap.has(model)) {
            modelUsageMap.set(model, {
              inputTokens: 0,
              outputTokens: 0,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
              webSearchRequests: 0,
              costUSD: 0,
              contextWindow: 200000, // All current Claude models are 200k
            });
          }
          const modelData = modelUsageMap.get(model)!;
          modelData.inputTokens += msgUsage.input_tokens || 0;
          modelData.outputTokens += msgUsage.output_tokens || 0;
          modelData.cacheReadInputTokens += msgUsage.cache_read_input_tokens || 0;
          modelData.cacheCreationInputTokens += msgUsage.cache_creation_input_tokens || 0;
        }
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  const modelUsage: { [modelName: string]: SDKModelUsage } = {};
  for (const [model, data] of modelUsageMap) {
    modelUsage[model] = data;
  }

  // If no usage data found, return null
  if (usage.input_tokens === 0 && usage.output_tokens === 0) {
    return null;
  }

  return { usage, modelUsage };
}
