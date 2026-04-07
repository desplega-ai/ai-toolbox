import { useCallback, useEffect, useState } from "react";
import type { GraphData, GraphNode } from "../../src/types.ts";

interface UseGraphDataReturn {
  data: GraphData | null;
  loading: boolean;
  error: string | null;
  selectedNode: GraphNode | null;
  setSelectedNode: (node: GraphNode | null) => void;
  highlightedNodes: Set<string>;
  highlightedEdges: Set<string>;
}

export function useGraphData(): UseGraphDataReturn {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNodeRaw] = useState<GraphNode | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [highlightedEdges, setHighlightedEdges] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((d: GraphData) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const setSelectedNode = useCallback(
    (node: GraphNode | null) => {
      setSelectedNodeRaw(node);
      if (!node || !data) {
        setHighlightedNodes(new Set());
        setHighlightedEdges(new Set());
        return;
      }

      const nodes = new Set<string>([node.id]);
      const edges = new Set<string>();

      for (const edge of data.edges) {
        if (edge.source === node.id || edge.target === node.id) {
          nodes.add(edge.source);
          nodes.add(edge.target);
          edges.add(`${edge.source}|${edge.target}`);
        }
      }

      setHighlightedNodes(nodes);
      setHighlightedEdges(edges);
    },
    [data],
  );

  return { data, loading, error, selectedNode, setSelectedNode, highlightedNodes, highlightedEdges };
}
