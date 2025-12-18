import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import IconButton from "@mui/joy/IconButton";
import Chip from "@mui/joy/Chip";
import { useHealth } from "../hooks/queries";

interface HeaderProps {
  onSettingsClick: () => void;
}

export default function Header({ onSettingsClick }: HeaderProps) {
  const { data: health, isError, isLoading } = useHealth();

  const connectionStatus = isLoading
    ? "connecting"
    : isError
      ? "error"
      : "connected";

  const statusColors = {
    connected: { bg: "rgba(0, 255, 136, 0.1)", border: "#00ff88", text: "#00ff88" },
    connecting: { bg: "rgba(255, 170, 0, 0.1)", border: "#ffaa00", text: "#ffaa00" },
    error: { bg: "rgba(255, 68, 68, 0.1)", border: "#ff4444", text: "#ff4444" },
  };

  const colors = statusColors[connectionStatus];

  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 3,
        py: 2,
        borderBottom: "1px solid",
        borderColor: "neutral.800",
        bgcolor: "background.surface",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Typography
          level="h3"
          sx={{
            fontFamily: "code",
            fontWeight: 700,
            background: "linear-gradient(90deg, #00ff88 0%, #00d4ff 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 0 30px rgba(0, 255, 136, 0.3)",
          }}
        >
          AGENT SWARM
        </Typography>
        <Chip
          size="sm"
          sx={{
            fontFamily: "code",
            fontSize: "0.65rem",
            bgcolor: colors.bg,
            border: "1px solid",
            borderColor: colors.border,
            color: colors.text,
            animation: connectionStatus === "connecting" ? "pulse 1s infinite" : undefined,
          }}
        >
          {connectionStatus === "connected" && health?.version
            ? `v${health.version}`
            : connectionStatus.toUpperCase()}
        </Chip>
      </Box>

      <IconButton
        variant="outlined"
        onClick={onSettingsClick}
        sx={{
          fontFamily: "code",
          borderColor: "neutral.700",
          color: "text.secondary",
          "&:hover": {
            borderColor: "primary.500",
            color: "primary.500",
            boxShadow: "0 0 10px rgba(0, 255, 136, 0.3)",
          },
        }}
      >
        ⚙
      </IconButton>
    </Box>
  );
}
