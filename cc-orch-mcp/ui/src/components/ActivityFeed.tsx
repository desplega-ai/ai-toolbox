import Box from "@mui/joy/Box";
import Card from "@mui/joy/Card";
import Typography from "@mui/joy/Typography";
import { useLogs } from "../hooks/queries";
import type { AgentLog } from "../types/api";

export default function ActivityFeed() {
  const { data: logs, isLoading } = useLogs(30);

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case "agent_joined":
        return "primary.500";
      case "agent_left":
        return "neutral.500";
      case "agent_status_change":
        return "warning.500";
      case "task_created":
        return "success.500";
      case "task_status_change":
        return "warning.500";
      case "task_progress":
        return "primary.300";
      default:
        return "text.secondary";
    }
  };

  const formatEventText = (log: AgentLog) => {
    const parts: string[] = [];

    if (log.agentId) {
      parts.push(`Agent ${log.agentId.slice(0, 8)}`);
    }

    switch (log.eventType) {
      case "agent_joined":
        return `${parts[0]} joined`;
      case "agent_left":
        return `${parts[0]} left`;
      case "agent_status_change":
        return `${parts[0]}: ${log.oldValue} → ${log.newValue}`;
      case "task_created":
        return `Task created`;
      case "task_status_change":
        return `Task ${log.taskId?.slice(0, 8)}: ${log.oldValue} → ${log.newValue}`;
      case "task_progress":
        return `Task ${log.taskId?.slice(0, 8)}: ${log.newValue}`;
      default:
        return log.eventType;
    }
  };

  return (
    <Card
      variant="outlined"
      sx={{
        p: 0,
        overflow: "hidden",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "neutral.800",
          bgcolor: "background.level1",
          flexShrink: 0,
        }}
      >
        <Typography
          level="title-md"
          sx={{
            fontFamily: "code",
            color: "primary.500",
            letterSpacing: "0.05em",
          }}
        >
          ACTIVITY FEED
        </Typography>
      </Box>

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
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {logs.map((log) => (
              <Box
                key={log.id}
                sx={{
                  display: "flex",
                  gap: 1.5,
                  pb: 1.5,
                  borderBottom: "1px solid",
                  borderColor: "neutral.800",
                  "&:last-child": { borderBottom: "none" },
                }}
              >
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    mt: 0.75,
                    borderRadius: "50%",
                    bgcolor: getEventColor(log.eventType),
                    boxShadow: `0 0 8px ${getEventColor(log.eventType)}`,
                    flexShrink: 0,
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.75rem",
                      color: "text.primary",
                      mb: 0.25,
                    }}
                  >
                    {formatEventText(log)}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.65rem",
                      color: "text.tertiary",
                    }}
                  >
                    {new Date(log.createdAt).toLocaleString()}
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
