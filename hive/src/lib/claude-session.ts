import { Command } from '@tauri-apps/plugin-shell'

export interface SessionState {
  sessionId: string | null
  messages: ClaudeMessage[]
  isRunning: boolean
  error: string | null
}

export interface ClaudeMessage {
  type: 'system' | 'user' | 'assistant' | 'result'
  subtype?: string
  session_id?: string
  content?: string
  tool_name?: string
  duration_ms?: number
  total_cost_usd?: number
}

export interface StreamCallbacks {
  onMessage: (message: ClaudeMessage) => void
  onSessionId: (id: string) => void
  onError: (error: Error) => void
  onComplete: () => void
}

export async function startSession(
  projectPath: string,
  prompt: string,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    const command = Command.create('claude', [
      '--output-format', 'stream-json',
      '--verbose',
      '--print', 'all',
      '-p', prompt
    ], { cwd: projectPath })

    const output = await command.execute()

    if (output.stdout) {
      const lines = output.stdout.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)

          if (parsed.type === 'system' && parsed.subtype === 'init' && parsed.session_id) {
            callbacks.onSessionId(parsed.session_id)
          }

          const message = parseClaudeMessage(parsed)
          if (message) {
            callbacks.onMessage(message)
          }
        } catch {
          // Non-JSON output, ignore
        }
      }
    }

    if (output.code !== 0) {
      callbacks.onError(new Error(output.stderr || `Claude exited with code ${output.code}`))
    } else {
      callbacks.onComplete()
    }
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }
}

export async function resumeSession(
  sessionId: string,
  prompt: string,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    const command = Command.create('claude', [
      '--output-format', 'stream-json',
      '--verbose',
      '--print', 'all',
      '--resume', sessionId,
      '-p', prompt
    ])

    const output = await command.execute()

    if (output.stdout) {
      const lines = output.stdout.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)

          if (parsed.type === 'system' && parsed.subtype === 'init' && parsed.session_id) {
            callbacks.onSessionId(parsed.session_id)
          }

          const message = parseClaudeMessage(parsed)
          if (message) {
            callbacks.onMessage(message)
          }
        } catch {
          // Non-JSON output, ignore
        }
      }
    }

    if (output.code !== 0) {
      callbacks.onError(new Error(output.stderr || `Claude exited with code ${output.code}`))
    } else {
      callbacks.onComplete()
    }
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }
}

function parseClaudeMessage(parsed: Record<string, unknown>): ClaudeMessage | null {
  const type = parsed.type as string

  if (type === 'system') {
    return {
      type: 'system',
      subtype: parsed.subtype as string,
      session_id: parsed.session_id as string
    }
  }

  if (type === 'assistant') {
    // Extract text content from message
    const message = parsed.message as Record<string, unknown> | undefined
    const content = message?.content
    let textContent = ''
    let toolName = ''

    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') {
          textContent += block.text
        } else if (block.type === 'tool_use') {
          toolName = block.name || ''
        }
      }
    } else if (typeof content === 'string') {
      textContent = content
    }

    return {
      type: 'assistant',
      content: textContent,
      tool_name: toolName || undefined
    }
  }

  if (type === 'user') {
    const message = parsed.message as Record<string, unknown> | undefined
    const content = message?.content
    return {
      type: 'user',
      content: typeof content === 'string' ? content : JSON.stringify(content)
    }
  }

  if (type === 'result') {
    return {
      type: 'result',
      subtype: parsed.subtype as string,
      duration_ms: parsed.duration_ms as number,
      total_cost_usd: parsed.total_cost_usd as number
    }
  }

  return null
}
