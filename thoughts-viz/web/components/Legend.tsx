import React from "react";

const NODE_TYPES = [
  { label: "Research", color: "#4A90D9" },
  { label: "Plan", color: "#50C878" },
  { label: "Brainstorm", color: "#9B59B6" },
];

const EDGE_TYPES = [
  { label: "Related", color: "#555" },
  { label: "Supersedes", color: "#E74C3C" },
  { label: "Research source", color: "#F39C12" },
  { label: "Citation", color: "#D4A017" },
  { label: "Link", color: "#666" },
];

export function Legend() {
  return (
    <div className="legend">
      <div className="legend-section">
        {NODE_TYPES.map((t) => (
          <div key={t.label} className="legend-item">
            <span className="legend-dot" style={{ background: t.color }} />
            <span>{t.label}</span>
          </div>
        ))}
      </div>
      <div className="legend-divider" />
      <div className="legend-section">
        {EDGE_TYPES.map((t) => (
          <div key={t.label} className="legend-item">
            <span className="legend-line" style={{ background: t.color }} />
            <span>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
