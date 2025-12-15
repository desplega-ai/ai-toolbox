import * as crypto from 'crypto';

/**
 * Create a deterministic hash for a tool call that's order-independent.
 * Handles nested objects/arrays by sorting keys recursively.
 *
 * @param toolName - The name of the tool (e.g., "Write", "Bash", "Edit")
 * @param input - The tool input object
 * @returns A 16-character hex hash string
 */
export function hashToolCall(toolName: string, input: unknown): string {
  const normalizedInput = normalizeValue(input);
  const payload = JSON.stringify({ tool: toolName, input: normalizedInput });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Recursively normalize a value for deterministic JSON stringification.
 * - Objects: sort keys alphabetically
 * - Arrays: keep order (arrays are ordered by design)
 * - Primitives: return as-is
 */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = normalizeValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}
