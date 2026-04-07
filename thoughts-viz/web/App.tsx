import React, { useCallback, useEffect, useRef, useState } from "react";
import type { GraphNode } from "../src/types.ts";
import { CommitDetail } from "./components/CommitDetail.tsx";
import { Graph } from "./components/Graph.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { Legend } from "./components/Legend.tsx";
import { SearchBar } from "./components/SearchBar.tsx";
import { TimelineBar } from "./components/TimelineBar.tsx";
import { ViewModeToggle } from "./components/ViewModeToggle.tsx";
import { useGraphData } from "./hooks/useGraphData.ts";
import { useTimeline } from "./hooks/useTimeline.ts";

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
    pendingNodeId,
  } = useGraphData();

  const {
    hasTimeline,
    viewMode,
    setViewMode,
    commitIndex,
    setCommitIndex,
    totalCommits,
    currentCommit,
    currentDiff,
    snapshotData,
    diffOverlay,
    diffOverlayEnabled,
    setDiffOverlayEnabled,
    playing,
    setPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    stepForward,
    stepBackward,
  } = useTimeline(data);

  const isTimeline = viewMode === "timeline" && hasTimeline;
  const graphData = isTimeline && snapshotData ? snapshotData : data;

  const [focusNodeId, setFocusNodeId] = useState<string | null>(pendingNodeId);
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const graphRef = useRef<{ recenter: () => void }>(null);

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
      if (node) {
        setFocusNodeId(`${node.id}::${Date.now()}`);
      }
    },
    [setSelectedNode],
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        if (cmdPaletteOpen) {
          setCmdPaletteOpen(false);
        } else if (selectedNode) {
          setSelectedNode(null);
        }
      }
      // Timeline shortcuts
      if (isTimeline && !cmdPaletteOpen) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          stepBackward();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          stepForward();
        } else if (e.key === " ") {
          e.preventDefault();
          setPlaying(!playing);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNode, setSelectedNode, cmdPaletteOpen, isTimeline, stepForward, stepBackward, playing, setPlaying]);

  // Merge hovered connection into highlighted set
  const effectiveHighlightedNodes = hoveredConnectionId
    ? new Set([...highlightedNodes, hoveredConnectionId])
    : highlightedNodes;

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
  if (!graphData) return null;

  const actualFocusId = focusNodeId?.split("::")[0] ?? null;
  const dirLabel =
    activeRepo?.name ?? data.metadata.sourceDir.split("/").slice(-2).join("/");

  return (
    <div className="app">
      <div className="graph-container">
        <div className="toolbar">
          <div className="toolbar-left">
            {mode === "multi" && (
              <button className="back-btn" type="button" onClick={goBack} title="Back to repos">
                &larr;
              </button>
            )}
            <SearchBar nodes={graphData.nodes} onSelect={handleSearchSelect} />
          </div>
          <div className="toolbar-right">
            <button
              className="cmdk-trigger"
              type="button"
              onClick={() => setCmdPaletteOpen(true)}
            >
              <span className="cmdk-trigger-icon">&#8984;K</span>
            </button>
            {hasTimeline && (
              <ViewModeToggle viewMode={viewMode} onToggle={setViewMode} />
            )}
            <div className="dir-badge" title={data.metadata.sourceDir}>
              {dirLabel}
            </div>
            <Legend />
          </div>
        </div>
        <Graph
          ref={graphRef}
          data={graphData}
          selectedNode={selectedNode}
          highlightedNodes={effectiveHighlightedNodes}
          highlightedEdges={highlightedEdges}
          hoveredNodeId={hoveredConnectionId}
          onNodeClick={handleGraphNodeClick}
          focusNodeId={actualFocusId}
          diffOverlay={isTimeline ? diffOverlay : null}
        />
        {isTimeline ? (
          <TimelineBar
            commitIndex={commitIndex}
            totalCommits={totalCommits}
            currentCommit={currentCommit}
            playing={playing}
            playbackSpeed={playbackSpeed}
            diffOverlayEnabled={diffOverlayEnabled}
            onCommitIndexChange={setCommitIndex}
            onPlayToggle={setPlaying}
            onSpeedChange={setPlaybackSpeed}
            onDiffOverlayToggle={setDiffOverlayEnabled}
            onStepForward={stepForward}
            onStepBackward={stepBackward}
          />
        ) : (
          <div className="bottom-bar">
            <div className="stats">
              {data.metadata.fileCount} files &middot; {data.edges.length} edges &middot;
              thoughts-viz v{data.metadata.version}
            </div>
            <button
              className="recenter-btn"
              type="button"
              onClick={() => graphRef.current?.recenter()}
              title="Re-center view"
            >
              Re-center
            </button>
          </div>
        )}
      </div>
      {isTimeline && !selectedNode && currentCommit && data.timeline && (
        <div className="detail-panel">
          <CommitDetail
            commit={currentCommit}
            diff={currentDiff}
            allNodes={data.timeline.allNodes}
            onNodeClick={handleNodeSelect}
            onClose={() => setViewMode("graph")}
          />
        </div>
      )}
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
            {graphData.edges
              .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
              .map((e) => {
                const otherId = e.source === selectedNode.id ? e.target : e.source;
                const otherNode = graphData.nodes.find((n) => n.id === otherId);
                if (!otherNode) return null;
                return (
                  <div
                    key={`${e.source}-${e.target}-${e.type}`}
                    className="connection-item"
                    onClick={() => handleNodeSelect(otherNode)}
                    onMouseEnter={() => setHoveredConnectionId(otherNode.id)}
                    onMouseLeave={() => setHoveredConnectionId(null)}
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
      {cmdPaletteOpen && (
        <CommandPalette
          nodes={graphData.nodes}
          repos={mode === "multi" ? repos : []}
          onSelectNode={(node) => {
            handleSearchSelect(node);
            setCmdPaletteOpen(false);
          }}
          onSelectRepo={(repo) => {
            loadRepo(repo);
            setCmdPaletteOpen(false);
          }}
          onRecenter={() => {
            graphRef.current?.recenter();
            setCmdPaletteOpen(false);
          }}
          onClose={() => setCmdPaletteOpen(false)}
          hasTimeline={hasTimeline}
          viewMode={viewMode}
          onSwitchToTimeline={() => {
            setViewMode("timeline");
            setCmdPaletteOpen(false);
          }}
          onSwitchToGraph={() => {
            setViewMode("graph");
            setCmdPaletteOpen(false);
          }}
          onToggleDiffOverlay={() => {
            setDiffOverlayEnabled(!diffOverlayEnabled);
            setCmdPaletteOpen(false);
          }}
          onPlayPause={() => {
            setPlaying(!playing);
            setCmdPaletteOpen(false);
          }}
        />
      )}
    </div>
  );
}
