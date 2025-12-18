import Chip from "@mui/joy/Chip";
import type { AgentStatus, TaskStatus } from "../types/api";

interface StatusBadgeProps {
  status: AgentStatus | TaskStatus;
  size?: "sm" | "md" | "lg";
}

const statusConfig = {
  // Agent statuses
  idle: { color: "primary" as const, label: "IDLE", glow: "rgba(0, 255, 136, 0.5)" },
  busy: { color: "warning" as const, label: "BUSY", glow: "rgba(255, 170, 0, 0.5)" },
  offline: { color: "neutral" as const, label: "OFFLINE", glow: "rgba(102, 102, 102, 0.3)" },
  // Task statuses
  pending: { color: "neutral" as const, label: "PENDING", glow: "rgba(102, 102, 102, 0.3)" },
  in_progress: { color: "warning" as const, label: "IN PROGRESS", glow: "rgba(255, 170, 0, 0.5)" },
  completed: { color: "success" as const, label: "COMPLETED", glow: "rgba(0, 255, 136, 0.5)" },
  failed: { color: "danger" as const, label: "FAILED", glow: "rgba(255, 68, 68, 0.5)" },
};

export default function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = statusConfig[status];
  const isActive = status === "busy" || status === "in_progress";

  return (
    <Chip
      size={size}
      color={config.color}
      variant="soft"
      sx={{
        fontFamily: "code",
        fontWeight: 600,
        fontSize: size === "sm" ? "0.65rem" : "0.75rem",
        letterSpacing: "0.05em",
        boxShadow: `0 0 10px ${config.glow}`,
        animation: isActive ? "pulse 2s infinite" : undefined,
        "@keyframes pulse": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.7 },
        },
      }}
    >
      {config.label}
    </Chip>
  );
}
