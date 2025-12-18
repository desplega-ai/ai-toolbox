import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import { useStats } from "../hooks/queries";

interface StatItemProps {
  label: string;
  value: number;
  color: string;
  glow: string;
}

function StatItem({ label, value, color, glow }: StatItemProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        px: 3,
        py: 1,
        borderRight: "1px solid",
        borderColor: "neutral.800",
        "&:last-child": { borderRight: "none" },
      }}
    >
      <Typography
        sx={{
          fontFamily: "code",
          fontSize: "1.75rem",
          fontWeight: 700,
          color,
          textShadow: `0 0 20px ${glow}`,
        }}
      >
        {value}
      </Typography>
      <Typography
        sx={{
          fontFamily: "code",
          fontSize: "0.65rem",
          color: "text.tertiary",
          letterSpacing: "0.1em",
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default function StatsBar() {
  const { data: stats } = useStats();

  if (!stats) return null;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        bgcolor: "background.surface",
        borderBottom: "1px solid",
        borderColor: "neutral.800",
        py: 1,
      }}
    >
      <StatItem
        label="TOTAL AGENTS"
        value={stats.agents.total}
        color="#00d4ff"
        glow="rgba(0, 212, 255, 0.5)"
      />
      <StatItem
        label="ACTIVE"
        value={stats.agents.busy}
        color="#ffaa00"
        glow="rgba(255, 170, 0, 0.5)"
      />
      <StatItem
        label="IDLE"
        value={stats.agents.idle}
        color="#00ff88"
        glow="rgba(0, 255, 136, 0.5)"
      />
      <StatItem
        label="TASKS PENDING"
        value={stats.tasks.pending}
        color="#888888"
        glow="rgba(136, 136, 136, 0.3)"
      />
      <StatItem
        label="IN PROGRESS"
        value={stats.tasks.in_progress}
        color="#ffaa00"
        glow="rgba(255, 170, 0, 0.5)"
      />
      <StatItem
        label="COMPLETED"
        value={stats.tasks.completed}
        color="#00ff88"
        glow="rgba(0, 255, 136, 0.5)"
      />
      <StatItem
        label="FAILED"
        value={stats.tasks.failed}
        color="#ff4444"
        glow="rgba(255, 68, 68, 0.5)"
      />
    </Box>
  );
}
