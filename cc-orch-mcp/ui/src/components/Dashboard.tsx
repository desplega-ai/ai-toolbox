import Box from "@mui/joy/Box";
import Header from "./Header";
import StatsBar from "./StatsBar";
import AgentsPanel from "./AgentsPanel";
import TasksPanel from "./TasksPanel";
import ActivityFeed from "./ActivityFeed";

interface DashboardProps {
  onSettingsClick: () => void;
}

export default function Dashboard({ onSettingsClick }: DashboardProps) {
  return (
    <Box
      sx={{
        height: "100vh",
        bgcolor: "background.body",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Header onSettingsClick={onSettingsClick} />
      <StatsBar />

      <Box
        sx={{
          flex: 1,
          p: 3,
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 3,
          minHeight: 0,
        }}
      >
        {/* Agents Panel - Top Left */}
        <Box sx={{ gridColumn: "1", gridRow: "1" }}>
          <AgentsPanel />
        </Box>

        {/* Activity Feed - Top Right */}
        <Box sx={{ gridColumn: "2", gridRow: "1 / 3" }}>
          <ActivityFeed />
        </Box>

        {/* Tasks Panel - Bottom Left */}
        <Box sx={{ gridColumn: "1", gridRow: "2" }}>
          <TasksPanel />
        </Box>
      </Box>
    </Box>
  );
}
