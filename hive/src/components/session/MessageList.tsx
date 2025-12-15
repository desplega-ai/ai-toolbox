import type { ClaudeMessage } from '../../lib/claude-session'

interface Props {
  messages: ClaudeMessage[]
}

export function MessageList({ messages }: Props) {
  return (
    <div className="space-y-4">
      {messages.map((message, index) => (
        <MessageItem key={index} message={message} />
      ))}
    </div>
  )
}

function MessageItem({ message }: { message: ClaudeMessage }) {
  if (message.type === 'system') {
    return (
      <div className="text-xs text-gray-500 py-1">
        {message.subtype === 'init' ? `Session started: ${message.session_id}` : message.subtype}
      </div>
    )
  }

  if (message.type === 'user') {
    return (
      <div className="bg-blue-900/30 rounded-lg p-3">
        <div className="text-xs text-blue-400 mb-1">You</div>
        <div className="text-gray-100">{message.content}</div>
      </div>
    )
  }

  if (message.type === 'assistant') {
    return (
      <div className="bg-gray-800 rounded-lg p-3">
        <div className="text-xs text-green-400 mb-1">Claude</div>
        {message.content && (
          <div className="text-gray-100 whitespace-pre-wrap">{message.content}</div>
        )}
        {message.tool_name && (
          <div className="mt-2 text-xs text-gray-400">
            Tool: {message.tool_name}
          </div>
        )}
      </div>
    )
  }

  if (message.type === 'result') {
    return (
      <div className="text-xs text-gray-500 py-1 border-t border-gray-700 mt-2 pt-2">
        Completed in {((message.duration_ms || 0) / 1000).toFixed(1)}s
        {(message.total_cost_usd || 0) > 0 && ` • $${message.total_cost_usd?.toFixed(4)}`}
      </div>
    )
  }

  return null
}
