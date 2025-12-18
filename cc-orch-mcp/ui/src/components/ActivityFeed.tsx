import Box from "@mui/joy/Box";
import Card from "@mui/joy/Card";
import Typography from "@mui/joy/Typography";
import Link from "@mui/joy/Link";
import { useColorScheme } from "@mui/joy/styles";
import { useLogs } from "../hooks/queries";
import { formatSmartTime } from "../lib/utils";
import type { AgentLog } from "../types/api";

interface ActivityFeedProps {
  onNavigateToAgent?: (agentId: string) => void;
  onNavigateToTask?: (taskId: string) => void;
}

export default function ActivityFeed({ onNavigateToAgent, onNavigateToTask }: ActivityFeedProps) {
  const { data: logs, isLoading } = useLogs(30);
  const { mode } = useColorScheme();
  const isDark = mode === "dark";

  const colors = {
    amber: isDark ? "#F5A623" : "#D48806",
    dormant: isDark ? "#6B5344" : "#A89A7C",
    honey: isDark ? "#FFB84D" : "#B87300",
    blue: "#3B82F6",
    gold: isDark ? "#D4A574" : "#8B6914",
    warmGray: isDark ? "#C9B896" : "#8B7355",
    tertiary: isDark ? "#8B7355" : "#6B5344",
    hoverBg: isDark ? "rgba(245, 166, 35, 0.03)" : "rgba(212, 136, 6, 0.03)",
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case "agent_joined":
        return colors.amber;
      case "agent_left":
        return colors.dormant;
      case "agent_status_change":
        return colors.honey;
      case "task_created":
        return colors.blue;
      case "task_status_change":
        return colors.gold;
      case "task_progress":
        return colors.warmGray;
      default:
        return colors.tertiary;
    }
  };

  const getEventGlow = (eventType: string) => {
    const color = getEventColor(eventType);
    return isDark ? `0 0 8px ${color}66` : `0 0 4px ${color}44`;
  };

  const renderEventContent = (log: AgentLog) => {
    const agentLink = log.agentId && onNavigateToAgent ? (
      <Link
        component="button"
        onClick={(e) => {
          e.stopPropagation();
          onNavigateToAgent(log.agentId!);
        }}
        sx={{
          fontFamily: "code",
          fontSize: "0.75rem",
          color: colors.amber,
          textDecoration: "none",
          cursor: "pointer",
          "&:hover": {
            textDecoration: "underline",
          },
        }}
      >
        Agent {log.agentId.slice(0, 8)}
      </Link>
    ) : log.agentId ? (
      <span>Agent {log.agentId.slice(0, 8)}</span>
    ) : null;

    const taskLink = log.taskId && onNavigateToTask ? (
      <Link
        component="button"
        onClick={(e) => {
          e.stopPropagation();
          onNavigateToTask(log.taskId!);
        }}
        sx={{
          fontFamily: "code",
          fontSize: "0.75rem",
          color: colors.gold,
          textDecoration: "none",
          cursor: "pointer",
          "&:hover": {
            textDecoration: "underline",
          },
        }}
      >
        Task {log.taskId.slice(0, 8)}
      </Link>
    ) : log.taskId ? (
      <span>Task {log.taskId.slice(0, 8)}</span>
    ) : null;

    switch (log.eventType) {
      case "agent_joined":
        return <>{agentLink} joined the swarm</>;
      case "agent_left":
        return <>{agentLink} left</>;
      case "agent_status_change":
        return <>{agentLink} updated status to {log.newValue}</>;
      case "task_created":
        return <>New task created{taskLink ? <> ({taskLink})</> : null}</>;
      case "task_status_change":
        return <>{taskLink} updated status to {log.newValue}</>;
      case "task_progress":
        return <>{taskLink}: {log.newValue}</>;
      default:
        return <>{log.eventType}</>;
    }
  };

  return (
    <Card
      variant="outlined"
      className="card-hover"
      sx={{
        p: 0,
        overflow: "hidden",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.surface",
        borderColor: "neutral.outlinedBorder",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "neutral.outlinedBorder",
          bgcolor: "background.level1",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        {/* Hex accent */}
        <Box
          sx={{
            width: 8,
            height: 10,
            clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            bgcolor: colors.blue,
            boxShadow: isDark ? "0 0 8px rgba(59, 130, 246, 0.5)" : "0 0 4px rgba(59, 130, 246, 0.3)",
          }}
        />
        <Typography
          level="title-md"
          sx={{
            fontFamily: "display",
            fontWeight: 600,
            color: colors.blue,
            letterSpacing: "0.03em",
          }}
        >
          ACTIVITY
        </Typography>
      </Box>

      {/* Timeline */}
      <Box sx={{ p: 2, flex: 1, overflowY: "auto" }}>
        {isLoading ? (
          <Typography sx={{ fontFamily: "code", color: "text.tertiary" }}>
            Loading activity...
          </Typography>
        ) : !logs || logs.length === 0 ? (
          <Typography sx={{ fontFamily: "code", color: "text.tertiary" }}>
            No recent activity
          </Typography>
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              position: "relative",
              // Vertical timeline line
              "&::before": {
                content: '""',
                position: "absolute",
                left: 5,
                top: 12,
                bottom: 12,
                width: 2,
                bgcolor: "neutral.outlinedBorder",
                borderRadius: 1,
              },
            }}
          >
            {logs.map((log, index) => (
              <Box
                key={log.id}
                sx={{
                  display: "flex",
                  gap: 2,
                  py: 1.5,
                  pl: 0,
                  position: "relative",
                  transition: "background-color 0.2s ease",
                  "&:hover": {
                    bgcolor: colors.hoverBg,
                  },
                }}
              >
                {/* Timeline node */}
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    bgcolor: getEventColor(log.eventType),
                    boxShadow: getEventGlow(log.eventType),
                    flexShrink: 0,
                    position: "relative",
                    zIndex: 1,
                    border: "2px solid",
                    borderColor: "background.surface",
                    animation: index === 0 ? "pulse-amber 2s ease-in-out infinite" : undefined,
                  }}
                />

                {/* Content */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    component="div"
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.75rem",
                      color: "text.primary",
                      mb: 0.25,
                      lineHeight: 1.4,
                    }}
                  >
                    {renderEventContent(log)}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.65rem",
                      color: "text.tertiary",
                    }}
                  >
                    {formatSmartTime(log.createdAt)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Card>
  );
}
