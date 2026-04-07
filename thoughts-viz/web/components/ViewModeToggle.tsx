import React from "react";

interface ViewModeToggleProps {
  viewMode: "graph" | "timeline";
  onToggle: (mode: "graph" | "timeline") => void;
}

export function ViewModeToggle({ viewMode, onToggle }: ViewModeToggleProps) {
  return (
    <div className="view-mode-toggle">
      <button
        type="button"
        className={`toggle-btn ${viewMode === "graph" ? "active" : ""}`}
        onClick={() => onToggle("graph")}
      >
        Graph
      </button>
      <button
        type="button"
        className={`toggle-btn ${viewMode === "timeline" ? "active" : ""}`}
        onClick={() => onToggle("timeline")}
      >
        Timeline
      </button>
    </div>
  );
}
