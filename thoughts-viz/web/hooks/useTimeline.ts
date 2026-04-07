import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphData,
  GraphEdge,
  GraphNode,
  TimelineCommit,
  TimelineData,
  TimelineDiff,
} from "../../src/types.ts";
import { getParam, setParam } from "../utils/url.ts";

type ViewMode = "graph" | "timeline";

interface DiffOverlay {
  addedNodes: Set<string>;
  removedNodes: Set<string>;
  addedEdges: Set<string>;
  removedEdges: Set<string>;
}

interface UseTimelineReturn {
  hasTimeline: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  commitIndex: number;
  setCommitIndex: (index: number) => void;
  totalCommits: number;
  currentCommit: TimelineCommit | null;
  currentDiff: TimelineDiff | null;
  snapshotData: GraphData | null;
  diffOverlay: DiffOverlay | null;
  diffOverlayEnabled: boolean;
  setDiffOverlayEnabled: (enabled: boolean) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
}

function parseEdgeKey(key: string): GraphEdge | null {
  const parts = key.split("|");
  if (parts.length !== 3) return null;
  return { source: parts[0]!, target: parts[1]!, type: parts[2] as GraphEdge["type"] };
}

export function useTimeline(data: GraphData | null): UseTimelineReturn {
  const hasTimeline = data?.metadata.timeline === true && !!data.timeline;
  const timeline = data?.timeline ?? null;

  const initialView = (getParam("view") === "timeline" && hasTimeline ? "timeline" : "graph") as ViewMode;
  const initialCommit = Number.parseInt(getParam("commit") ?? "0", 10);

  const [viewMode, setViewModeRaw] = useState<ViewMode>(initialView);
  const [commitIndex, setCommitIndexRaw] = useState(initialCommit);
  const [diffOverlayEnabled, setDiffOverlayEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000); // ms between commits

  const totalCommits = timeline?.commits.length ?? 0;

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeRaw(mode);
      setParam("view", mode === "timeline" ? "timeline" : null);
      if (mode === "graph") {
        setParam("commit", null);
        setPlaying(false);
      }
    },
    [],
  );

  const setCommitIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, totalCommits - 1));
      setCommitIndexRaw(clamped);
      setParam("commit", String(clamped));
    },
    [totalCommits],
  );

  const stepForward = useCallback(() => {
    setCommitIndex(commitIndex + 1);
  }, [commitIndex, setCommitIndex]);

  const stepBackward = useCallback(() => {
    setCommitIndex(commitIndex - 1);
  }, [commitIndex, setCommitIndex]);

  // Auto-advance playback
  useEffect(() => {
    if (!playing || !hasTimeline) return;
    const interval = setInterval(() => {
      setCommitIndexRaw((prev) => {
        const next = prev + 1;
        if (next >= totalCommits) {
          setPlaying(false);
          return prev;
        }
        setParam("commit", String(next));
        return next;
      });
    }, playbackSpeed);
    return () => clearInterval(interval);
  }, [playing, playbackSpeed, totalCommits, hasTimeline]);

  const currentCommit = useMemo(() => {
    if (!timeline || commitIndex >= timeline.commits.length) return null;
    return timeline.commits[commitIndex] ?? null;
  }, [timeline, commitIndex]);

  const currentDiff = useMemo(() => {
    if (!timeline || commitIndex >= timeline.diffs.length) return null;
    return timeline.diffs[commitIndex] ?? null;
  }, [timeline, commitIndex]);

  // Build GraphData for the current snapshot
  const snapshotData = useMemo(() => {
    if (!timeline || !data || commitIndex >= timeline.snapshots.length) return null;
    const snapshot = timeline.snapshots[commitIndex]!;

    const nodeIdSet = new Set(snapshot.nodeIds);
    const edgeKeySet = new Set(snapshot.edgeKeys);

    const nodes = timeline.allNodes.filter((n) => nodeIdSet.has(n.id));
    const edges = timeline.allEdges.filter(
      (e) => edgeKeySet.has(`${e.source}|${e.target}|${e.type}`),
    );

    // If diff overlay is enabled, inject ghost nodes/edges for removed items
    if (diffOverlayEnabled && currentDiff) {
      const removedNodeIds = new Set(currentDiff.removedNodeIds);
      const removedEdgeKeys = new Set(currentDiff.removedEdgeKeys);

      const ghostNodes = timeline.allNodes.filter(
        (n) => removedNodeIds.has(n.id) && !nodeIdSet.has(n.id),
      );
      const ghostEdges: GraphEdge[] = [];
      for (const key of currentDiff.removedEdgeKeys) {
        const edge = parseEdgeKey(key);
        if (edge && !edgeKeySet.has(key)) {
          ghostEdges.push(edge);
        }
      }

      return {
        nodes: [...nodes, ...ghostNodes],
        edges: [...edges, ...ghostEdges],
        metadata: data.metadata,
      };
    }

    return { nodes, edges, metadata: data.metadata };
  }, [timeline, data, commitIndex, diffOverlayEnabled, currentDiff]);

  // Compute diff overlay sets
  const diffOverlay = useMemo((): DiffOverlay | null => {
    if (!diffOverlayEnabled || !currentDiff) return null;
    return {
      addedNodes: new Set(currentDiff.addedNodeIds),
      removedNodes: new Set(currentDiff.removedNodeIds),
      addedEdges: new Set(currentDiff.addedEdgeKeys),
      removedEdges: new Set(currentDiff.removedEdgeKeys),
    };
  }, [diffOverlayEnabled, currentDiff]);

  return {
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
  };
}
