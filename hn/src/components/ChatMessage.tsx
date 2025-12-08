import { memo } from "react";
import { cn } from "../lib/utils";

interface HNItem {
  id: number;
  type: string;
  by: string;
  time: number;
  title: string | null;
  text: string | null;
  url: string | null;
  score: number | null;
  parent: number | null;
  descendants: number | null;
  is_read: number;
}

interface ChatMessageProps {
  item: HNItem;
  depth: number;
  isUserComment: boolean;
  isReplyToUser: boolean;
  selectedUser: string;
  formatDate: (timestamp: number) => string;
  isUnread?: boolean;
}

export const ChatMessage = memo(
  function ChatMessage({
    item,
    depth,
    isUserComment,
    isReplyToUser,
    selectedUser,
    formatDate,
    isUnread = false,
  }: ChatMessageProps) {
    const isFromUser = item.by === selectedUser;
    const showOnRight = isFromUser;
    const maxIndent = 8; // Cap visual indentation
    const effectiveDepth = Math.min(depth, maxIndent);

    // Generate indentation class
    const indentClass = effectiveDepth > 0 ? `ml-${effectiveDepth * 4}` : "";

    return (
      <div
        className={cn(
          "flex items-start gap-3 mb-4",
          showOnRight ? "flex-row-reverse" : "flex-row",
          indentClass
        )}
        style={
          effectiveDepth > 0
            ? { marginLeft: `${effectiveDepth * 1}rem` }
            : undefined
        }
      >
        {/* Depth indicator for very deep threads */}
        {depth > maxIndent && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span>↳ +{depth - maxIndent}</span>
          </div>
        )}

        {/* Avatar circle with initials */}
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
            isFromUser
              ? "bg-green-500 text-white"
              : "bg-gray-300 text-gray-700"
          )}
        >
          {item.by.substring(0, 2).toUpperCase()}
        </div>

        {/* Message bubble */}
        <div
          className={cn(
            "flex flex-col gap-1 max-w-[75%]",
            showOnRight ? "items-end" : "items-start"
          )}
        >
          {/* Metadata: author, time, unread badge */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-medium">{item.by}</span>
            <span>•</span>
            <span>{formatDate(item.time)}</span>
            {isUnread && (
              <span className="px-2 py-0.5 rounded-full bg-green-500 text-white font-semibold">
                NEW
              </span>
            )}
          </div>

          {/* Content bubble with color coding */}
          <div
            className={cn(
              "rounded-2xl px-4 py-3 shadow-sm",
              isFromUser
                ? "bg-green-100 text-green-900 rounded-tr-sm" // User: green, right
                : isReplyToUser
                  ? "bg-blue-100 text-blue-900 rounded-tl-sm" // Reply to user: blue, left
                  : "bg-gray-100 text-gray-900 rounded-tl-sm", // Context: gray, left
              isUnread && "ring-2 ring-green-500"
            )}
          >
            {/* Story title (if applicable) */}
            {item.title && (
              <h3 className="font-bold mb-2 text-sm">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </h3>
            )}

            {/* Comment text with HN HTML */}
            {item.text && (
              <div
                className="prose prose-sm max-w-none [&_a]:text-blue-600 [&_a]:hover:underline"
                dangerouslySetInnerHTML={{ __html: item.text }}
              />
            )}

            {/* Story metadata */}
            {item.score !== null && item.type === "story" && (
              <div className="flex gap-3 text-xs text-gray-600 mt-2 pt-2 border-t border-gray-300">
                <span>{item.score} points</span>
                {item.descendants !== null && (
                  <span>{item.descendants} comments</span>
                )}
              </div>
            )}
          </div>

          {/* HN link */}
          <a
            href={`https://news.ycombinator.com/item?id=${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            View on HN →
          </a>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for shallow props
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.isUnread === nextProps.isUnread &&
      prevProps.depth === nextProps.depth
    );
  }
);
