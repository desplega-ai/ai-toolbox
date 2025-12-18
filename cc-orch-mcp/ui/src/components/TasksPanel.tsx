import { useState } from "react";
import Box from "@mui/joy/Box";
import Card from "@mui/joy/Card";
import Typography from "@mui/joy/Typography";
import Table from "@mui/joy/Table";
import Select from "@mui/joy/Select";
import Option from "@mui/joy/Option";
import { useTasks } from "../hooks/queries";
import StatusBadge from "./StatusBadge";
import type { TaskStatus } from "../types/api";

export default function TasksPanel() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const { data: tasks, isLoading } = useTasks(statusFilter === "all" ? undefined : statusFilter);

  return (
    <Card variant="outlined" sx={{ p: 0, overflow: "hidden" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "neutral.800",
          bgcolor: "background.level1",
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
          TASKS ({tasks?.length || 0})
        </Typography>
        <Select
          value={statusFilter}
          onChange={(_, value) => setStatusFilter(value as TaskStatus | "all")}
          size="sm"
          sx={{
            fontFamily: "code",
            fontSize: "0.75rem",
            minWidth: 140,
          }}
        >
          <Option value="all">ALL</Option>
          <Option value="pending">PENDING</Option>
          <Option value="in_progress">IN PROGRESS</Option>
          <Option value="completed">COMPLETED</Option>
          <Option value="failed">FAILED</Option>
        </Select>
      </Box>

      {isLoading ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography sx={{ fontFamily: "code", color: "text.tertiary" }}>
            Loading tasks...
          </Typography>
        </Box>
      ) : !tasks || tasks.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography sx={{ fontFamily: "code", color: "text.tertiary" }}>
            No tasks found
          </Typography>
        </Box>
      ) : (
        <Table
          size="sm"
          sx={{
            "--TableCell-paddingY": "8px",
            "--TableCell-paddingX": "12px",
            "& thead th": {
              bgcolor: "background.surface",
              fontFamily: "code",
              fontSize: "0.7rem",
              letterSpacing: "0.05em",
              color: "text.tertiary",
            },
            "& tbody tr:hover": {
              bgcolor: "background.level1",
            },
          }}
        >
          <thead>
            <tr>
              <th>TASK</th>
              <th style={{ width: "120px" }}>STATUS</th>
              <th style={{ width: "150px" }}>PROGRESS</th>
              <th style={{ width: "120px" }}>UPDATED</th>
            </tr>
          </thead>
          <tbody>
            {tasks.slice(0, 20).map((task) => (
              <tr key={task.id}>
                <td>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.8rem",
                      color: "text.primary",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 400,
                    }}
                  >
                    {task.task}
                  </Typography>
                </td>
                <td>
                  <StatusBadge status={task.status} />
                </td>
                <td>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.7rem",
                      color: "text.tertiary",
                    }}
                  >
                    {task.progress || "—"}
                  </Typography>
                </td>
                <td>
                  <Typography
                    sx={{
                      fontFamily: "code",
                      fontSize: "0.7rem",
                      color: "text.tertiary",
                    }}
                  >
                    {new Date(task.lastUpdatedAt).toLocaleTimeString()}
                  </Typography>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {tasks && tasks.length > 20 && (
        <Box sx={{ p: 1.5, textAlign: "center", borderTop: "1px solid", borderColor: "neutral.800" }}>
          <Typography
            sx={{
              fontFamily: "code",
              fontSize: "0.7rem",
              color: "text.tertiary",
            }}
          >
            Showing 20 of {tasks.length} tasks
          </Typography>
        </Box>
      )}
    </Card>
  );
}
