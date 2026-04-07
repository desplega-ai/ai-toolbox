import React, { useCallback, useState } from "react";
import type { GraphNode } from "../src/types.ts";
import { Graph } from "./components/Graph.tsx";
import { Legend } from "./components/Legend.tsx";
import { SearchBar } from "./components/SearchBar.tsx";
import { useGraphData } from "./hooks/useGraphData.ts";

export function App() {
  const {
    mode,
    data,
    loading,
    error,
    selectedNode,
    setSelectedNode,
    highlightedNodes,
    highlightedEdges,
    repos,
    activeRepo,
    loadRepo,
    goBack,
  } = useGraphData();
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  const handleNodeSelect = useCallback(
    (node: GraphNode | null) => {
      setSelectedNode(node);
      if (node) {
        setFocusNodeId(`${node.id}::${Date.now()}`);
      }
    },
    [setSelectedNode],
  );

  const handleSearchSelect = useCallback(
    (node: GraphNode) => {
      setSelectedNode(node);
      setFocusNodeId(`${node.id}::${Date.now()}`);
    },
    [setSelectedNode],
  );

  const handleGraphNodeClick = useCallback(
    (node: GraphNode | null) => {
      setSelectedNode(node);
    },
    [setSelectedNode],
  );

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  // Multi-repo mode: show repo selector if no repo loaded
  if (mode === "multi" && !data) {
    return (
      <div className="repo-selector">
        <h1>thoughts-viz</h1>
        <p className="repo-subtitle">Select a repository to explore its thought graph</p>
        <div className="repo-grid">
          {repos.map((repo) => (
            <button key={repo.id} className="repo-card" type="button" onClick={() => loadRepo(repo)}>
              <h2>{repo.name}</h2>
              <div className="repo-stats">
                <span>{repo.fileCount} files</span>
                <span>&middot;</span>
                <span>{repo.edgeCount} edges</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const actualFocusId = focusNodeId?.split("::")[0] ?? null;
  const dirLabel =
    activeRepo?.name ?? data.metadata.sourceDir.split("/").slice(-2).join("/");

  return (
    <div className="app">
      <div className="toolbar">
        <div className="toolbar-left">
          {mode === "multi" && (
            <button className="back-btn" type="button" onClick={goBack} title="Back to repos">
              &larr;
            </button>
          )}
          <SearchBar nodes={data.nodes} onSelect={handleSearchSelect} />
        </div>
        <div className="toolbar-right">
          {mode === "multi" && repos.length > 1 && (
            <select
              className="repo-dropdown"
              value={activeRepo?.id ?? ""}
              onChange={(e) => {
                const repo = repos.find((r) => r.id === e.target.value);
                if (repo) loadRepo(repo);
              }}
            >
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
          <div className="dir-badge" title={data.metadata.sourceDir}>
            {dirLabel}
          </div>
          <Legend />
        </div>
      </div>
      <div className="graph-container">
        <Graph
          data={data}
          selectedNode={selectedNode}
          highlightedNodes={highlightedNodes}
          highlightedEdges={highlightedEdges}
          onNodeClick={handleGraphNodeClick}
          focusNodeId={actualFocusId}
        />
      </div>
      {selectedNode && (
        <div className="detail-panel">
          <button className="close-btn" onClick={() => setSelectedNode(null)} type="button">
            &times;
          </button>
          <h2>{selectedNode.topic}</h2>
          <div className="meta">
            <span className={`badge badge-${selectedNode.docType}`}>{selectedNode.docType}</span>
            <span className="badge badge-owner">{selectedNode.owner}</span>
            {selectedNode.status !== "unknown" && (
              <span className="badge badge-status">{selectedNode.status}</span>
            )}
          </div>
          <div className="detail-row">
            <label>File</label>
            <span>{selectedNode.filename}</span>
          </div>
          {selectedNode.date && (
            <div className="detail-row">
              <label>Date</label>
              <span>{selectedNode.date}</span>
            </div>
          )}
          {selectedNode.author !== "unknown" && (
            <div className="detail-row">
              <label>Author</label>
              <span>{selectedNode.author}</span>
            </div>
          )}
          {selectedNode.tags.length > 0 && (
            <div className="detail-row">
              <label>Tags</label>
              <div className="tags">
                {selectedNode.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="connections">
            <h3>Connections ({selectedNode.connectionCount})</h3>
            {data.edges
              .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
              .map((e) => {
                const otherId = e.source === selectedNode.id ? e.target : e.source;
                const otherNode = data.nodes.find((n) => n.id === otherId);
                if (!otherNode) return null;
                return (
                  <div
                    key={`${e.source}-${e.target}-${e.type}`}
                    className="connection-item"
                    onClick={() => handleNodeSelect(otherNode)}
                  >
                    <span className={`edge-type edge-${e.type}`}>{e.type}</span>
                    <span className="connection-name">
                      {otherNode.filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "")}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
      <div className="stats">
        {data.metadata.fileCount} files &middot; {data.edges.length} edges &middot;
        thoughts-viz v{data.metadata.version}
      </div>
    </div>
  );
}
