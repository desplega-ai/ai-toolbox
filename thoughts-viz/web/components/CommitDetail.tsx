import React from "react";
import type { GraphNode, TimelineCommit, TimelineDiff } from "../../src/types.ts";

interface CommitDetailProps {
  commit: TimelineCommit;
  diff: TimelineDiff | null;
  allNodes: GraphNode[];
  onNodeClick: (node: GraphNode) => void;
  onClose: () => void;
}

export function CommitDetail({ commit, diff, allNodes, onNodeClick, onClose }: CommitDetailProps) {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  const addedNodes = diff?.addedNodeIds.map((id) => nodeMap.get(id)).filter(Boolean) as GraphNode[] ?? [];
  const removedNodes = diff?.removedNodeIds.map((id) => nodeMap.get(id)).filter(Boolean) as GraphNode[] ?? [];

  return (
    <>
      <button className="close-btn" onClick={onClose} type="button">
        &times;
      </button>
      <h2>{commit.message}</h2>
      <div className="meta">
        <span className="badge badge-owner">{commit.hash}</span>
        <span className="badge badge-status">{commit.author}</span>
      </div>
      <div className="detail-row">
        <label>Date</label>
        <span>{new Date(commit.date).toLocaleDateString()}</span>
      </div>
      <div className="detail-row">
        <label>Files changed</label>
        <span>{commit.filesChanged}</span>
      </div>

      {addedNodes.length > 0 && (
        <div className="connections">
          <h3>Added ({addedNodes.length})</h3>
          {addedNodes.map((node) => (
            <div
              key={node.id}
              className="connection-item"
              onClick={() => onNodeClick(node)}
            >
              <span className={`edge-type edge-added`}>added</span>
              <span className="connection-name">
                {node.filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "")}
              </span>
            </div>
          ))}
        </div>
      )}

      {removedNodes.length > 0 && (
        <div className="connections">
          <h3>Removed ({removedNodes.length})</h3>
          {removedNodes.map((node) => (
            <div key={node.id} className="connection-item">
              <span className={`edge-type edge-removed`}>removed</span>
              <span className="connection-name">
                {node.filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "")}
              </span>
            </div>
          ))}
        </div>
      )}

      {diff && diff.addedEdgeKeys.length + diff.removedEdgeKeys.length > 0 && (
        <div className="connections">
          <h3>Edges</h3>
          {diff.addedEdgeKeys.length > 0 && (
            <div className="edge-summary added">+{diff.addedEdgeKeys.length} connections</div>
          )}
          {diff.removedEdgeKeys.length > 0 && (
            <div className="edge-summary removed">-{diff.removedEdgeKeys.length} connections</div>
          )}
        </div>
      )}
    </>
  );
}
