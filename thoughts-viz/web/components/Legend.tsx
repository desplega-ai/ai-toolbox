import React, { useState } from "react";

const NODE_TYPES = [
  { label: "Research", color: "#4A90D9", desc: "Investigation and analysis documents" },
  { label: "Plan", color: "#50C878", desc: "Implementation plans and specifications" },
  { label: "Brainstorm", color: "#9B59B6", desc: "Exploratory ideas and discussions" },
];

const EDGE_TYPES = [
  { label: "Related", color: "#555", desc: "Bidirectional relationship between related documents" },
  { label: "Supersedes", color: "#E74C3C", desc: "This document replaces or evolves a previous one" },
  { label: "Research source", color: "#F39C12", desc: "Plan references this research as its basis" },
  { label: "Citation", color: "#D4A017", desc: "Inline reference to another document" },
  { label: "Link", color: "#666", desc: "Markdown link to another document" },
];

export function Legend() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="legend-wrapper">
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
        <div className="legend-divider" />
        <button
          className="legend-help-btn"
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          title="What do these mean?"
        >
          ?
        </button>
      </div>
      {showHelp && (
        <div className="legend-help-panel">
          <div className="legend-help-section">
            <h4>Node types</h4>
            {NODE_TYPES.map((t) => (
              <div key={t.label} className="legend-help-row">
                <span className="legend-dot" style={{ background: t.color }} />
                <span className="legend-help-label">{t.label}</span>
                <span className="legend-help-desc">{t.desc}</span>
              </div>
            ))}
          </div>
          <div className="legend-help-section">
            <h4>Edge types</h4>
            {EDGE_TYPES.map((t) => (
              <div key={t.label} className="legend-help-row">
                <span className="legend-line" style={{ background: t.color }} />
                <span className="legend-help-label">{t.label}</span>
                <span className="legend-help-desc">{t.desc}</span>
              </div>
            ))}
            <div className="legend-help-row">
              <span className="legend-help-note">Curved arrows indicate bidirectional relationships (both documents reference each other).</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
