import React, { useCallback, useEffect, useMemo, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { GraphData, GraphNode } from "../../src/types.ts";

const NODE_COLORS: Record<string, string> = {
  research: "#4A90D9",
  plan: "#50C878",
  brainstorm: "#9B59B6",
};

const EDGE_COLORS: Record<string, string> = {
  related: "#555",
  supersedes: "#E74C3C",
  "research-source": "#F39C12",
  citation: "#D4A017",
  "markdown-link": "#666",
};

function truncateLabel(filename: string, maxLen = 28): string {
  const label = filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return label.length > maxLen ? `${label.slice(0, maxLen)}...` : label;
}

interface GraphProps {
  data: GraphData;
  selectedNode: GraphNode | null;
  highlightedNodes: Set<string>;
  highlightedEdges: Set<string>;
  onNodeClick: (node: GraphNode | null) => void;
  focusNodeId: string | null;
}

export function Graph({
  data,
  selectedNode,
  highlightedNodes,
  highlightedEdges,
  onNodeClick,
  focusNodeId,
}: GraphProps) {
  const fgRef = useRef<any>(null);
  const hasHighlight = highlightedNodes.size > 0;

  const graphData = useMemo(() => {
    return {
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.edges.map((e) => ({ ...e })),
    };
  }, [data]);

  // Keep a ref to the mutable nodes array for position lookups
  const nodesRef = useRef(graphData.nodes);
  nodesRef.current = graphData.nodes;

  // Increase forces for more spacing
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-200);
    fg.d3Force("link")?.distance(80);
    fg.d3Force("center")?.strength(0.05);
  }, []);

  // Focus on a node when focusNodeId changes
  useEffect(() => {
    if (!focusNodeId || !fgRef.current) return;
    const node = nodesRef.current.find((n: any) => n.id === focusNodeId) as any;
    if (node?.x != null && node?.y != null) {
      fgRef.current.centerAt(node.x, node.y, 500);
      fgRef.current.zoom(3, 500);
    }
  }, [focusNodeId]);

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const id = node.id as string;
      const label = truncateLabel(node.filename);
      const docType = node.docType as string;
      const size = Math.max(5, (node.connectionCount ?? 0) * 1.5 + 3);
      const color = NODE_COLORS[docType] ?? "#888";

      const isHighlighted = !hasHighlight || highlightedNodes.has(id);
      const isSelected = selectedNode?.id === id;
      const alpha = isHighlighted ? 1 : 0.12;

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1;
        ctx.stroke();
      }

      // Always show labels — scale font with zoom
      const fontSize = Math.min(14, Math.max(3, 11 / globalScale));
      ctx.font = `${fontSize}px -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isHighlighted ? "#c9d1d9" : "#3b424a";
      ctx.globalAlpha = isHighlighted ? Math.min(1, globalScale * 0.6) : alpha * 0.5;
      ctx.fillText(label, node.x, node.y + size + 2);

      ctx.globalAlpha = 1;
    },
    [hasHighlight, highlightedNodes, selectedNode],
  );

  const linkColor = useCallback(
    (link: any) => {
      const key = `${link.source?.id ?? link.source}|${link.target?.id ?? link.target}`;
      if (hasHighlight && !highlightedEdges.has(key)) {
        return "rgba(80,80,80,0.06)";
      }
      return EDGE_COLORS[link.type] ?? "#444";
    },
    [hasHighlight, highlightedEdges],
  );

  const linkWidth = useCallback(
    (link: any) => {
      const key = `${link.source?.id ?? link.source}|${link.target?.id ?? link.target}`;
      return hasHighlight && highlightedEdges.has(key) ? 2 : 0.4;
    },
    [hasHighlight, highlightedEdges],
  );

  const handleNodeClick = useCallback(
    (node: any) => {
      const graphNode = data.nodes.find((n) => n.id === node.id) ?? null;
      onNodeClick(graphNode);
    },
    [data, onNodeClick],
  );

  const handleBackgroundClick = useCallback(() => {
    onNodeClick(null);
  }, [onNodeClick]);

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={graphData}
      nodeId="id"
      nodeCanvasObject={nodeCanvasObject}
      nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
        const size = Math.max(5, (node.connectionCount ?? 0) * 1.5 + 3);
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 5, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      }}
      linkColor={linkColor}
      linkWidth={linkWidth}
      linkDirectionalArrowLength={3.5}
      linkDirectionalArrowRelPos={0.9}
      onNodeClick={handleNodeClick}
      onBackgroundClick={handleBackgroundClick}
      onNodeDragEnd={(node: any) => {
        node.fx = node.x;
        node.fy = node.y;
      }}
      enableNodeDrag={true}
      backgroundColor="#0f1117"
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.25}
      warmupTicks={80}
      cooldownTime={3000}
    />
  );
}
