import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import Input from "@mui/joy/Input";
import IconButton from "@mui/joy/IconButton";
import Card from "@mui/joy/Card";
import Chip from "@mui/joy/Chip";
import Link from "@mui/joy/Link";
import Tooltip from "@mui/joy/Tooltip";
import { useColorScheme } from "@mui/joy/styles";
import { useChannels, useMessages, useThreadMessages, usePostMessage } from "../hooks/queries";
import type { ChannelMessage } from "../types/api";
import { formatSmartTime } from "@/lib/utils";

interface MessageItemProps {
  message: ChannelMessage;
  isDark: boolean;
  colors: Record<string, string>;
  onOpenThread?: () => void;
  threadCount?: number;
  isThreadView?: boolean;
  onAgentClick?: (agentId: string) => void;
  isSelected?: boolean;
}

function MessageItem({
  message,
  isDark,
  colors,
  onOpenThread,
  threadCount,
  isThreadView,
  onAgentClick,
  isSelected,
}: MessageItemProps) {
  const hasReplies = threadCount && threadCount > 0;
  const isClickable = !isThreadView && (hasReplies || onOpenThread);

  return (
    <Box
      onClick={isClickable ? onOpenThread : undefined}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        p: 2,
        mx: 1,
        my: 0.5,
        borderRadius: "8px",
        border: "1px solid",
        borderColor: isSelected ? colors.amberBorder : "transparent",
        bgcolor: isSelected
          ? colors.selectedBg
          : isDark ? "rgba(26, 19, 14, 0.5)" : "rgba(255, 255, 255, 0.5)",
        cursor: isClickable ? "pointer" : "default",
        transition: "all 0.2s ease",
        "&:hover": {
          bgcolor: isDark ? "rgba(245, 166, 35, 0.06)" : "rgba(212, 136, 6, 0.04)",
          borderColor: isClickable ? colors.amberBorder : "transparent",
          "& .reply-icon": {
            opacity: 1,
          },
        },
      }}
    >
      {/* Header row */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        {/* Agent indicator dot */}
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: message.agentId ? colors.amber : colors.blue,
            flexShrink: 0,
            boxShadow: message.agentId
              ? (isDark ? "0 0 6px rgba(245, 166, 35, 0.4)" : "0 0 4px rgba(212, 136, 6, 0.3)")
              : "0 0 6px rgba(59, 130, 246, 0.4)",
          }}
        />

        {/* Agent name - clickable if agent */}
        {message.agentId && onAgentClick ? (
          <Link
            component="button"
            onClick={(e) => {
              e.stopPropagation();
              onAgentClick(message.agentId!);
            }}
            sx={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: "0.85rem",
              color: colors.amber,
              textDecoration: "none",
              cursor: "pointer",
              "&:hover": {
                textDecoration: "underline",
                color: colors.honey,
              },
            }}
          >
            {message.agentName || "Agent"}
          </Link>
        ) : (
          <Typography
            sx={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: "0.85rem",
              color: message.agentId ? colors.amber : colors.blue,
            }}
          >
            {message.agentName || "Human"}
          </Typography>
        )}

        {/* Timestamp */}
        <Typography
          sx={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.7rem",
            color: "text.tertiary",
            letterSpacing: "0.02em",
          }}
        >
          {formatSmartTime(message.createdAt)}
        </Typography>

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Reply count badge */}
        {!isThreadView && hasReplies && (
          <Chip
            size="sm"
            variant="soft"
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.65rem",
              fontWeight: 600,
              bgcolor: isDark ? "rgba(212, 165, 116, 0.15)" : "rgba(139, 105, 20, 0.1)",
              color: colors.gold,
              border: `1px solid ${isDark ? "rgba(212, 165, 116, 0.3)" : "rgba(139, 105, 20, 0.2)"}`,
              px: 1,
              height: 22,
              "& .MuiChip-label": {
                px: 0.5,
              },
            }}
          >
            {threadCount} {threadCount === 1 ? "reply" : "replies"}
          </Chip>
        )}

        {/* Reply icon - appears on hover */}
        {!isThreadView && onOpenThread && (
          <Tooltip title="Open thread" placement="top">
            <IconButton
              className="reply-icon"
              size="sm"
              variant="plain"
              onClick={(e) => {
                e.stopPropagation();
                onOpenThread();
              }}
              sx={{
                opacity: 0,
                transition: "opacity 0.2s ease",
                color: "text.tertiary",
                fontSize: "1rem",
                width: 28,
                height: 28,
                "&:hover": {
                  color: colors.amber,
                  bgcolor: colors.hoverBg,
                },
              }}
            >
              ↩
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Message content */}
      <Typography
        sx={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: "0.9rem",
          color: "text.primary",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          pl: 2.75,
        }}
      >
        {message.content}
      </Typography>
    </Box>
  );
}

interface ChatPanelProps {
  selectedChannelId?: string | null;
  selectedThreadId?: string | null;
  onSelectChannel?: (channelId: string | null) => void;
  onSelectThread?: (threadId: string | null) => void;
  onNavigateToAgent?: (agentId: string) => void;
}

export default function ChatPanel({
  selectedChannelId: controlledChannelId,
  selectedThreadId: controlledThreadId,
  onSelectChannel,
  onSelectThread,
  onNavigateToAgent,
}: ChatPanelProps) {
  // Internal state for uncontrolled mode
  const [internalChannelId, setInternalChannelId] = useState<string | null>(null);
  const [internalThreadId, setInternalThreadId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [threadMessageInput, setThreadMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Use controlled or internal state
  const selectedChannelId = controlledChannelId !== undefined ? controlledChannelId : internalChannelId;
  const selectedThreadId = controlledThreadId !== undefined ? controlledThreadId : internalThreadId;

  const setSelectedChannelId = useCallback((id: string | null) => {
    if (onSelectChannel) {
      onSelectChannel(id);
    } else {
      setInternalChannelId(id);
    }
  }, [onSelectChannel]);

  const setSelectedThreadId = useCallback((id: string | null) => {
    if (onSelectThread) {
      onSelectThread(id);
    } else {
      setInternalThreadId(id);
    }
  }, [onSelectThread]);

  const { mode } = useColorScheme();
  const isDark = mode === "dark";

  const colors = {
    amber: isDark ? "#F5A623" : "#D48806",
    gold: isDark ? "#D4A574" : "#8B6914",
    honey: isDark ? "#FFB84D" : "#B87300",
    blue: "#3B82F6",
    amberGlow: isDark ? "0 0 8px rgba(245, 166, 35, 0.5)" : "0 0 6px rgba(212, 136, 6, 0.3)",
    hoverBg: isDark ? "rgba(245, 166, 35, 0.05)" : "rgba(212, 136, 6, 0.05)",
    selectedBg: isDark ? "rgba(245, 166, 35, 0.1)" : "rgba(212, 136, 6, 0.08)",
    amberBorder: isDark ? "rgba(245, 166, 35, 0.3)" : "rgba(212, 136, 6, 0.25)",
    inputBg: isDark ? "rgba(13, 9, 6, 0.6)" : "rgba(255, 255, 255, 0.8)",
    inputBorder: isDark ? "#3A2D1F" : "#E5D9CA",
  };

  const { data: channels, isLoading: channelsLoading } = useChannels();
  const { data: messages, isLoading: messagesLoading } = useMessages(selectedChannelId || "");
  const { data: threadMessages } = useThreadMessages(
    selectedChannelId || "",
    selectedThreadId || ""
  );
  const postMessageMutation = usePostMessage(selectedChannelId || "");

  const selectedChannel = channels?.find((c) => c.id === selectedChannelId);

  // Find thread message from messages
  const selectedThreadMessage = useMemo(() => {
    if (!selectedThreadId || !messages) return null;
    return messages.find((m) => m.id === selectedThreadId) || null;
  }, [selectedThreadId, messages]);

  // Auto-select first channel only if no channel is selected
  useEffect(() => {
    if (channels && channels.length > 0 && !selectedChannelId) {
      const firstChannel = channels[0];
      if (firstChannel) {
        setSelectedChannelId(firstChannel.id);
      }
    }
  }, [channels, selectedChannelId, setSelectedChannelId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Scroll to bottom of thread when thread opens or messages change
  useEffect(() => {
    if (selectedThreadId && threadMessages) {
      setTimeout(() => {
        threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [selectedThreadId, threadMessages]);

  // Count replies per message
  const replyCounts = new Map<string, number>();
  messages?.forEach((msg) => {
    if (msg.replyToId) {
      replyCounts.set(msg.replyToId, (replyCounts.get(msg.replyToId) || 0) + 1);
    }
  });

  // Filter out threaded replies from main view (only show top-level messages)
  const topLevelMessages = messages?.filter((msg) => !msg.replyToId) || [];

  const handleSendMessage = useCallback(() => {
    if (!messageInput.trim() || !selectedChannelId) return;

    postMessageMutation.mutate({
      content: messageInput.trim(),
    });
    setMessageInput("");
  }, [messageInput, selectedChannelId, postMessageMutation]);

  const handleSendThreadMessage = useCallback(() => {
    if (!threadMessageInput.trim() || !selectedChannelId || !selectedThreadMessage) return;

    postMessageMutation.mutate({
      content: threadMessageInput.trim(),
      replyToId: selectedThreadMessage.id,
    });
    setThreadMessageInput("");
  }, [threadMessageInput, selectedChannelId, selectedThreadMessage, postMessageMutation]);

  const handleOpenThread = useCallback((message: ChannelMessage) => {
    setSelectedThreadId(message.id);
  }, [setSelectedThreadId]);

  const handleCloseThread = useCallback(() => {
    setSelectedThreadId(null);
  }, [setSelectedThreadId]);

  const handleAgentClick = useCallback((agentId: string) => {
    if (onNavigateToAgent) {
      onNavigateToAgent(agentId);
    }
  }, [onNavigateToAgent]);

  // Input styles shared between main and thread
  const inputStyles = {
    flex: 1,
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: "0.875rem",
    bgcolor: colors.inputBg,
    borderColor: colors.inputBorder,
    borderRadius: "8px",
    "--Input-focusedThickness": "2px",
    "--Input-focusedHighlight": colors.amber,
    "&:hover": {
      borderColor: isDark ? "#4A3A2F" : "#D1C5B4",
    },
    "&:focus-within": {
      borderColor: colors.amber,
      boxShadow: isDark ? "0 0 0 2px rgba(245, 166, 35, 0.15)" : "0 0 0 2px rgba(212, 136, 6, 0.1)",
    },
    "& input": {
      fontFamily: "'Space Grotesk', sans-serif",
      color: isDark ? "#FFF8E7" : "#1A130E",
    },
    "& input::placeholder": {
      color: isDark ? "#8B7355" : "#8B7355",
      fontFamily: "'Space Grotesk', sans-serif",
    },
  };

  const sendButtonStyles = {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: "0.8rem",
    fontWeight: 600,
    letterSpacing: "0.03em",
    px: 2.5,
    borderRadius: "8px",
    bgcolor: colors.amber,
    color: isDark ? "#1A130E" : "#FFFFFF",
    border: "none",
    transition: "all 0.2s ease",
    "&:hover": {
      bgcolor: colors.honey,
      transform: "translateY(-1px)",
      boxShadow: isDark ? "0 4px 12px rgba(245, 166, 35, 0.3)" : "0 4px 12px rgba(212, 136, 6, 0.2)",
    },
    "&:active": {
      transform: "translateY(0)",
    },
    "&:disabled": {
      opacity: 0.5,
      transform: "none",
      boxShadow: "none",
    },
  };

  return (
    <Card
      variant="outlined"
      sx={{
        p: 0,
        height: "100%",
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
        bgcolor: "background.surface",
        borderColor: "neutral.outlinedBorder",
        borderRadius: "12px",
        gap: 0,
      }}
    >
      {/* Channel List - Fixed width */}
      <Box
        sx={{
          width: 220,
          flexShrink: 0,
          borderRight: "1px solid",
          borderColor: "neutral.outlinedBorder",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          bgcolor: isDark ? "rgba(13, 9, 6, 0.3)" : "rgba(245, 237, 228, 0.5)",
        }}
      >
        {/* Channels header */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: "1px solid",
            borderColor: "neutral.outlinedBorder",
            bgcolor: "background.level1",
            height: 64,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 10,
                clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                bgcolor: colors.amber,
                boxShadow: colors.amberGlow,
              }}
            />
            <Typography
              sx={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                color: colors.amber,
                letterSpacing: "0.05em",
                fontSize: "0.85rem",
              }}
            >
              CHANNELS
            </Typography>
          </Box>
        </Box>

        {/* Channel list */}
        <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
          {channelsLoading ? (
            <Typography sx={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.8rem", color: "text.tertiary", p: 1.5 }}>
              Loading...
            </Typography>
          ) : !channels || channels.length === 0 ? (
            <Typography sx={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.8rem", color: "text.tertiary", p: 1.5 }}>
              No channels
            </Typography>
          ) : (
            channels.map((channel) => (
              <Box
                key={channel.id}
                onClick={() => {
                  setSelectedChannelId(channel.id);
                  setSelectedThreadId(null);
                }}
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: "6px",
                  cursor: "pointer",
                  bgcolor: selectedChannelId === channel.id ? colors.selectedBg : "transparent",
                  border: "1px solid",
                  borderColor: selectedChannelId === channel.id ? colors.amberBorder : "transparent",
                  transition: "all 0.15s ease",
                  mb: 0.5,
                  "&:hover": {
                    bgcolor: selectedChannelId === channel.id ? colors.selectedBg : colors.hoverBg,
                  },
                }}
              >
                <Typography
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.8rem",
                    fontWeight: selectedChannelId === channel.id ? 600 : 400,
                    color: selectedChannelId === channel.id ? colors.amber : "text.secondary",
                  }}
                >
                  # {channel.name}
                </Typography>
              </Box>
            ))
          )}
        </Box>
      </Box>

      {/* Messages Panel - Flex, equal split with thread */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Channel header with title and description */}
        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            borderBottom: "1px solid",
            borderColor: "neutral.outlinedBorder",
            bgcolor: "background.level1",
            height: 64,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <Typography
            sx={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: "1rem",
              color: "text.primary",
              mb: 0.25,
            }}
          >
            # {selectedChannel?.name || "Select a channel"}
          </Typography>
          {selectedChannel?.description && (
            <Typography
              sx={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "0.75rem",
                color: "text.tertiary",
                lineHeight: 1.4,
              }}
            >
              {selectedChannel.description}
            </Typography>
          )}
        </Box>

        {/* Messages list */}
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            py: 1,
            bgcolor: isDark ? "rgba(13, 9, 6, 0.2)" : "rgba(253, 248, 243, 0.5)",
          }}
        >
          {messagesLoading ? (
            <Typography sx={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.85rem", color: "text.tertiary", p: 3 }}>
              Loading messages...
            </Typography>
          ) : topLevelMessages.length === 0 ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <Typography sx={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.9rem", color: "text.tertiary", mb: 1 }}>
                No messages yet
              </Typography>
              <Typography sx={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.8rem", color: "text.tertiary" }}>
                Start the conversation!
              </Typography>
            </Box>
          ) : (
            <>
              {topLevelMessages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  isDark={isDark}
                  colors={colors}
                  onOpenThread={() => handleOpenThread(message)}
                  threadCount={replyCounts.get(message.id)}
                  onAgentClick={handleAgentClick}
                  isSelected={selectedThreadMessage?.id === message.id}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </Box>

        {/* Message input */}
        <Box
          sx={{
            p: 2,
            borderTop: "1px solid",
            borderColor: "neutral.outlinedBorder",
            display: "flex",
            gap: 1.5,
            bgcolor: "background.level1",
          }}
        >
          <Input
            placeholder="Type a message..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            sx={inputStyles}
          />
          <Box
            component="button"
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || postMessageMutation.isPending}
            sx={sendButtonStyles}
          >
            Send
          </Box>
        </Box>
      </Box>

      {/* Thread Panel - Equal width to messages */}
      {selectedThreadMessage && (
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            borderLeft: "1px solid",
            borderColor: "neutral.outlinedBorder",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            bgcolor: isDark ? "rgba(37, 28, 21, 0.3)" : "rgba(245, 237, 228, 0.3)",
          }}
        >
          {/* Thread header */}
          <Box
            sx={{
              px: 2.5,
              py: 1.5,
              borderBottom: "1px solid",
              borderColor: "neutral.outlinedBorder",
              bgcolor: "background.level1",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 64,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 8,
                  height: 10,
                  clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                  bgcolor: colors.gold,
                  boxShadow: isDark ? "0 0 6px rgba(212, 165, 116, 0.4)" : "0 0 4px rgba(139, 105, 20, 0.3)",
                }}
              />
              <Typography
                sx={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  color: colors.gold,
                  letterSpacing: "0.05em",
                }}
              >
                THREAD
              </Typography>
            </Box>
            <Tooltip title="Close thread" placement="bottom">
              <IconButton
                size="sm"
                variant="plain"
                onClick={handleCloseThread}
                sx={{
                  color: "text.tertiary",
                  fontSize: "1.1rem",
                  "&:hover": {
                    color: "text.primary",
                    bgcolor: colors.hoverBg,
                  },
                }}
              >
                ✕
              </IconButton>
            </Tooltip>
          </Box>

          {/* Original message */}
          <Box
            sx={{
              borderBottom: "1px solid",
              borderColor: "neutral.outlinedBorder",
              bgcolor: isDark ? "rgba(245, 166, 35, 0.03)" : "rgba(212, 136, 6, 0.02)",
            }}
          >
            <MessageItem
              message={selectedThreadMessage}
              isDark={isDark}
              colors={colors}
              isThreadView
              onAgentClick={handleAgentClick}
            />
          </Box>

          {/* Thread divider */}
          <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ flex: 1, height: 1, bgcolor: "neutral.outlinedBorder" }} />
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.65rem",
                color: "text.tertiary",
                letterSpacing: "0.05em",
              }}
            >
              {threadMessages?.length || 0} {(threadMessages?.length || 0) === 1 ? "REPLY" : "REPLIES"}
            </Typography>
            <Box sx={{ flex: 1, height: 1, bgcolor: "neutral.outlinedBorder" }} />
          </Box>

          {/* Thread replies */}
          <Box
            sx={{
              flex: 1,
              overflow: "auto",
              py: 0.5,
            }}
          >
            {threadMessages && threadMessages.length > 0 ? (
              <>
                {threadMessages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    isDark={isDark}
                    colors={colors}
                    isThreadView
                    onAgentClick={handleAgentClick}
                  />
                ))}
                <div ref={threadEndRef} />
              </>
            ) : (
              <Box sx={{ p: 3, textAlign: "center" }}>
                <Typography sx={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.85rem", color: "text.tertiary" }}>
                  No replies yet
                </Typography>
              </Box>
            )}
          </Box>

          {/* Thread message input */}
          <Box
            sx={{
              p: 2,
              borderTop: "1px solid",
              borderColor: "neutral.outlinedBorder",
              display: "flex",
              gap: 1.5,
              bgcolor: "background.level1",
            }}
          >
            <Input
              placeholder="Reply to thread..."
              value={threadMessageInput}
              onChange={(e) => setThreadMessageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendThreadMessage();
                }
              }}
              sx={inputStyles}
            />
            <Box
              component="button"
              onClick={handleSendThreadMessage}
              disabled={!threadMessageInput.trim() || postMessageMutation.isPending}
              sx={sendButtonStyles}
            >
              Reply
            </Box>
          </Box>
        </Box>
      )}
    </Card>
  );
}
