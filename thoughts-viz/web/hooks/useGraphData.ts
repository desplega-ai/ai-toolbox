import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphData, GraphNode } from "../../src/types.ts";
import { getParam, setParam } from "../utils/url.ts";

interface ManifestEntry {
  id: string;
  name: string;
  file: string;
  fileCount: number;
  edgeCount: number;
}

interface Manifest {
  repos: ManifestEntry[];
}

type Mode = "loading" | "single" | "multi";

interface UseGraphDataReturn {
  mode: Mode;
  data: GraphData | null;
  loading: boolean;
  error: string | null;
  selectedNode: GraphNode | null;
  setSelectedNode: (node: GraphNode | null) => void;
  highlightedNodes: Set<string>;
  highlightedEdges: Set<string>;
  // Multi-repo
  repos: ManifestEntry[];
  activeRepo: ManifestEntry | null;
  loadRepo: (repo: ManifestEntry) => void;
  goBack: () => void;
  pendingNodeId: string | null;
}

export function useGraphData(): UseGraphDataReturn {
  const [mode, setMode] = useState<Mode>("loading");
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNodeRaw] = useState<GraphNode | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [highlightedEdges, setHighlightedEdges] = useState<Set<string>>(new Set());
  const [repos, setRepos] = useState<ManifestEntry[]>([]);
  const [activeRepo, setActiveRepo] = useState<ManifestEntry | null>(null);
  const [pendingNodeId, setPendingNodeId] = useState<string | null>(getParam("node"));
  const loadRepoRef = useRef<(repo: ManifestEntry) => void>(null);

  // Detect mode on mount
  useEffect(() => {
    (async () => {
      // Try single-repo mode first (/api/graph)
      try {
        const resp = await fetch("/api/graph");
        if (resp.ok) {
          const d: GraphData = await resp.json();
          setData(d);
          setMode("single");
          setLoading(false);
          return;
        }
      } catch {
        // not available
      }

      // Try multi-repo mode (/data/manifest.json)
      try {
        const resp = await fetch("/data/manifest.json");
        if (resp.ok) {
          const manifest: Manifest = await resp.json();
          setRepos(manifest.repos);
          setMode("multi");
          setLoading(false);
          // Auto-load repo from URL param
          const repoParam = getParam("repo");
          if (repoParam) {
            const repo = manifest.repos.find((r) => r.id === repoParam);
            if (repo && loadRepoRef.current) {
              loadRepoRef.current(repo);
            }
          }
          return;
        }
      } catch {
        // not available
      }

      setError("Could not load graph data or manifest.");
      setLoading(false);
    })();
  }, []);

  const loadRepo = useCallback((repo: ManifestEntry) => {
    setLoading(true);
    setSelectedNodeRaw(null);
    setHighlightedNodes(new Set());
    setHighlightedEdges(new Set());
    setParam("repo", repo.id);
    setParam("node", null);

    fetch(`/data/${repo.file}`)
      .then((r) => r.json())
      .then((d: GraphData) => {
        setData(d);
        setActiveRepo(repo);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  loadRepoRef.current = loadRepo;

  const goBack = useCallback(() => {
    setData(null);
    setActiveRepo(null);
    setSelectedNodeRaw(null);
    setHighlightedNodes(new Set());
    setHighlightedEdges(new Set());
    setParam("repo", null);
    setParam("node", null);
    setParam("q", null);
  }, []);

  const setSelectedNode = useCallback(
    (node: GraphNode | null) => {
      setSelectedNodeRaw(node);
      setParam("node", node?.id ?? null);
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

  // Restore node selection from URL once data loads
  useEffect(() => {
    if (!data || !pendingNodeId) return;
    const node = data.nodes.find((n) => n.id === pendingNodeId);
    if (node) {
      setSelectedNode(node);
    }
    setPendingNodeId(null);
  }, [data, pendingNodeId, setSelectedNode]);

  return {
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
  };
}
