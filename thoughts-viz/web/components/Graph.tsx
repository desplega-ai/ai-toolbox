import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { forceX, forceY } from "d3-force-3d";
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

export interface GraphHandle {
  recenter: () => void;
}

interface DiffOverlay {
  addedNodes: Set<string>;
  removedNodes: Set<string>;
  addedEdges: Set<string>;
  removedEdges: Set<string>;
}

interface GraphProps {
  data: GraphData;
  selectedNode: GraphNode | null;
  highlightedNodes: Set<string>;
  highlightedEdges: Set<string>;
  hoveredNodeId: string | null;
  onNodeClick: (node: GraphNode | null) => void;
  focusNodeId: string | null;
  diffOverlay?: DiffOverlay | null;
}

export const Graph = forwardRef<GraphHandle, GraphProps>(function Graph(
  { data, selectedNode, highlightedNodes, highlightedEdges, hoveredNodeId, onNodeClick, focusNodeId, diffOverlay },
  ref,
) {
  const fgRef = useRef<any>(null);
  const hasHighlight = highlightedNodes.size > 0;

  // Detect bidirectional edge pairs and assign curvature so they don't overlap
  const graphData = useMemo(() => {
    const edgeKeys = new Set(data.edges.map((e) => `${e.source}|${e.target}`));
    const links = data.edges.map((e) => {
      const hasReverse = edgeKeys.has(`${e.target}|${e.source}`);
      return { ...e, curvature: hasReverse ? 0.15 : 0 };
    });
    return {
      nodes: data.nodes.map((n) => ({ ...n })),
      links,
    };
  }, [data]);

  // Keep a ref to the mutable nodes array for position lookups
  const nodesRef = useRef(graphData.nodes);
  nodesRef.current = graphData.nodes;

  useImperativeHandle(ref, () => ({
    recenter: () => {
      if (!fgRef.current) return;
      fgRef.current.zoomToFit(400, 60);
    },
  }));

  // Increase forces for more spacing
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-200);
    fg.d3Force("link")?.distance(80);
    fg.d3Force("center")?.strength(0.05);
    fg.d3Force("gravityX", forceX(0).strength(0.06));
    fg.d3Force("gravityY", forceY(0).strength(0.06));
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
      const isSelected = selectedNode?.id === id;
      const fullLabel = node.filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
      const label = isSelected ? fullLabel : truncateLabel(node.filename, 32);
      const docType = node.docType as string;
      const size = Math.max(5, (node.connectionCount ?? 0) * 1.5 + 3);
      const color = NODE_COLORS[docType] ?? "#888";

      const isHighlighted = !hasHighlight || highlightedNodes.has(id);
      const alpha = isHighlighted ? 1 : 0.12;

      const isAdded = diffOverlay?.addedNodes.has(id);
      const isRemoved = diffOverlay?.removedNodes.has(id);

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);

      if (isRemoved) {
        // Ghost node: semi-transparent red dashed outline
        ctx.fillStyle = "#E74C3C";
        ctx.globalAlpha = 0.15;
        ctx.fill();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "#E74C3C";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fill();
      }

      // Added node: green glow
      if (isAdded) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 6, 0, 2 * Math.PI);
        ctx.fillStyle = "#50C878";
        ctx.globalAlpha = 0.25;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI);
        ctx.strokeStyle = "#50C878";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.stroke();
      }

      const isHovered = hoveredNodeId === id;

      if (isHovered && !isRemoved) {
        // Outer glow
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 6, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.fill();
        // Inner ring
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
      }

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
      if (isRemoved) {
        ctx.fillStyle = "#E74C3C";
        ctx.globalAlpha = 0.4;
      } else if (isAdded) {
        ctx.fillStyle = "#50C878";
        ctx.globalAlpha = Math.min(1, globalScale * 0.6);
      } else {
        ctx.fillStyle = isHighlighted ? "#c9d1d9" : "#3b424a";
        ctx.globalAlpha = isHighlighted ? Math.min(1, globalScale * 0.6) : alpha * 0.5;
      }
      ctx.fillText(label, node.x, node.y + size + 2);

      ctx.globalAlpha = 1;
    },
    [hasHighlight, highlightedNodes, selectedNode, hoveredNodeId, diffOverlay],
  );

  const linkColor = useCallback(
    (link: any) => {
      const key = `${link.source?.id ?? link.source}|${link.target?.id ?? link.target}`;
      if (diffOverlay) {
        const edgeKey = `${link.source?.id ?? link.source}|${link.target?.id ?? link.target}|${link.type}`;
        if (diffOverlay.addedEdges.has(edgeKey)) return "#50C878";
        if (diffOverlay.removedEdges.has(edgeKey)) return "rgba(231,76,60,0.4)";
      }
      if (hasHighlight && !highlightedEdges.has(key)) {
        return "rgba(80,80,80,0.06)";
      }
      return EDGE_COLORS[link.type] ?? "#444";
    },
    [hasHighlight, highlightedEdges, diffOverlay],
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
      linkCurvature="curvature"
      linkDirectionalArrowLength={6}
      linkDirectionalArrowRelPos={0.85}
      linkDirectionalParticles={(link: any) => {
        if (!hasHighlight) return 0;
        const key = `${link.source?.id ?? link.source}|${link.target?.id ?? link.target}`;
        return highlightedEdges.has(key) ? 3 : 0;
      }}
      linkDirectionalParticleWidth={2.5}
      linkDirectionalParticleSpeed={0.005}
      linkDirectionalParticleColor={linkColor}
      onNodeClick={handleNodeClick}
      onBackgroundClick={handleBackgroundClick}
      onNodeDragEnd={(node: any, translate: { x: number; y: number }) => {
        node.fx = node.x;
        node.fy = node.y;
        const dist = Math.sqrt(translate.x ** 2 + translate.y ** 2);
        if (dist < 8) {
          handleNodeClick(node);
        }
      }}
      enableNodeDrag={true}
      backgroundColor="#0f1117"
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.25}
      warmupTicks={80}
      cooldownTime={3000}
    />
  );
});
