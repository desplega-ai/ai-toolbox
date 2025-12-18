import { useState } from "react";
import Box from "@mui/joy/Box";
import Card from "@mui/joy/Card";
import Typography from "@mui/joy/Typography";
import Table from "@mui/joy/Table";
import IconButton from "@mui/joy/IconButton";
import { useAgents } from "../hooks/queries";
import StatusBadge from "./StatusBadge";
import type { AgentWithTasks } from "../types/api";

interface AgentRowProps {
  agent: AgentWithTasks;
  expanded: boolean;
  onToggle: () => void;
}

function AgentRow({ agent, expanded, onToggle }: AgentRowProps) {
  const activeTasks = agent.tasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  ).length;

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: "pointer" }}
      >
        <td>
          <IconButton
            size="sm"
            variant="plain"
            sx={{ color: "text.tertiary" }}
          >
            {expanded ? "▼" : "▶"}
          </IconButton>
        </td>
        <td>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography
              sx={{
                fontFamily: "code",
                fontWeight: 600,
                color: agent.isLead ? "primary.500" : "text.primary",
              }}
            >
              {agent.name}
            </Typography>
            {agent.isLead && (
              <Typography
                sx={{
                  fontFamily: "code",
                  fontSize: "0.6rem",
                  color: "primary.500",
                  textShadow: "0 0 10px rgba(0, 255, 136, 0.5)",
                }}
              >
                ★ LEAD
              </Typography>
            )}
          </Box>
        </td>
        <td>
          <StatusBadge status={agent.status} />
        </td>
        <td>
          <Typography
            sx={{
              fontFamily: "code",
              fontSize: "0.8rem",
              color: activeTasks > 0 ? "warning.500" : "text.tertiary",
            }}
          >
            {activeTasks} active / {agent.tasks.length} total
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
            {new Date(agent.lastUpdatedAt).toLocaleTimeString()}
          </Typography>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} style={{ padding: 0, border: "none" }}>
            <Box
              sx={{
                bgcolor: "background.level1",
                p: 2,
                borderTop: "1px solid",
                borderColor: "neutral.800",
              }}
            >
              {agent.tasks.length === 0 ? (
                <Typography
                  sx={{
                    fontFamily: "code",
                    fontSize: "0.8rem",
                    color: "text.tertiary",
                    fontStyle: "italic",
                  }}
                >
                  No tasks assigned
                </Typography>
              ) : (
                <>
                  <Table size="sm" sx={{ "--TableCell-paddingY": "4px" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "40%" }}>Task</th>
                        <th style={{ width: "15%" }}>Status</th>
                        <th style={{ width: "25%" }}>Progress</th>
                        <th style={{ width: "20%" }}>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agent.tasks.slice(0, 5).map((task) => (
                        <tr key={task.id}>
                          <td>
                            <Typography
                              sx={{
                                fontFamily: "code",
                                fontSize: "0.75rem",
                                color: "text.secondary",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 300,
                              }}
                            >
                              {task.task}
                            </Typography>
                          </td>
                          <td>
                            <StatusBadge status={task.status} size="sm" />
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
                  {agent.tasks.length > 5 && (
                    <Typography
                      sx={{
                        fontFamily: "code",
                        fontSize: "0.7rem",
                        color: "text.tertiary",
                        textAlign: "center",
                        mt: 1,
                      }}
                    >
                      +{agent.tasks.length - 5} more tasks
                    </Typography>
                  )}
                </>
              )}
            </Box>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AgentsPanel() {
  const { data: agents, isLoading } = useAgents();
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const toggleAgent = (agentId: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ fontFamily: "code", color: "text.tertiary" }}>
          Loading agents...
        </Typography>
      </Card>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ fontFamily: "code", color: "text.tertiary" }}>
          No agents found
        </Typography>
      </Card>
    );
  }

  return (
    <Card variant="outlined" sx={{ p: 0, overflow: "hidden" }}>
      <Box
        sx={{
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
          AGENTS ({agents.length})
        </Typography>
      </Box>
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
        }}
      >
        <thead>
          <tr>
            <th style={{ width: "40px" }}></th>
            <th>NAME</th>
            <th>STATUS</th>
            <th>TASKS</th>
            <th>LAST UPDATE</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              expanded={expandedAgents.has(agent.id)}
              onToggle={() => toggleAgent(agent.id)}
            />
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
