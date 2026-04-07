import Fuse from "fuse.js";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode } from "../../src/types.ts";

interface Repo {
  id: string;
  name: string;
  file: string;
  fileCount: number;
  edgeCount: number;
}

interface CommandItem {
  id: string;
  label: string;
  category: "action" | "repo" | "node";
  data?: GraphNode | Repo;
}

interface CommandPaletteProps {
  nodes: GraphNode[];
  repos: Repo[];
  onSelectNode: (node: GraphNode) => void;
  onSelectRepo: (repo: Repo) => void;
  onRecenter: () => void;
  onClose: () => void;
  hasTimeline?: boolean;
  viewMode?: "graph" | "timeline";
  onSwitchToTimeline?: () => void;
  onSwitchToGraph?: () => void;
  onToggleDiffOverlay?: () => void;
  onPlayPause?: () => void;
}

export function CommandPalette({
  nodes,
  repos,
  onSelectNode,
  onSelectRepo,
  onRecenter,
  onClose,
  hasTimeline,
  viewMode,
  onSwitchToTimeline,
  onSwitchToGraph,
  onToggleDiffOverlay,
  onPlayPause,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const actions: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [
      { id: "cmd:recenter", label: "Re-center view", category: "action" },
    ];
    if (hasTimeline) {
      if (viewMode === "graph") {
        items.push({ id: "cmd:timeline", label: "Switch to Timeline", category: "action" });
      } else {
        items.push({ id: "cmd:graph", label: "Switch to Graph", category: "action" });
        items.push({ id: "cmd:diff", label: "Toggle diff overlay", category: "action" });
        items.push({ id: "cmd:playpause", label: "Play / Pause timeline", category: "action" });
      }
    }
    return items;
  }, [hasTimeline, viewMode]);

  const repoItems: CommandItem[] = useMemo(
    () =>
      repos.map((r) => ({
        id: `repo:${r.id}`,
        label: r.name,
        category: "repo" as const,
        data: r,
      })),
    [repos],
  );

  const fuse = useMemo(
    () =>
      new Fuse(nodes, {
        keys: [
          { name: "filename", weight: 0.4 },
          { name: "topic", weight: 0.4 },
          { name: "tags", weight: 0.2 },
        ],
        threshold: 0.4,
      }),
    [nodes],
  );

  const items: CommandItem[] = useMemo(() => {
    if (!query.trim()) {
      return [...actions, ...repoItems];
    }
    const q = query.toLowerCase();
    const matchedActions = actions.filter((a) => a.label.toLowerCase().includes(q));
    const matchedRepos = repoItems.filter((r) => r.label.toLowerCase().includes(q));
    const matchedNodes = fuse
      .search(query, { limit: 10 })
      .map((r) => ({
        id: `node:${r.item.id}`,
        label: r.item.filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, ""),
        category: "node" as const,
        data: r.item,
      }));
    return [...matchedActions, ...matchedRepos, ...matchedNodes];
  }, [query, actions, repoItems, fuse]);

  // Reset active index when items change
  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      switch (item.category) {
        case "action":
          if (item.id === "cmd:recenter") onRecenter();
          else if (item.id === "cmd:timeline") onSwitchToTimeline?.();
          else if (item.id === "cmd:graph") onSwitchToGraph?.();
          else if (item.id === "cmd:diff") onToggleDiffOverlay?.();
          else if (item.id === "cmd:playpause") onPlayPause?.();
          break;
        case "repo":
          onSelectRepo(item.data as Repo);
          break;
        case "node":
          onSelectNode(item.data as GraphNode);
          break;
      }
    },
    [onRecenter, onSelectRepo, onSelectNode],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
        case "Tab": {
          if (e.key === "Tab" && e.shiftKey) return;
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % Math.max(1, items.length));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (items[activeIndex]) handleSelect(items[activeIndex]);
          break;
        }
        case "Escape": {
          e.preventDefault();
          onClose();
          break;
        }
      }
    },
    [items, activeIndex, handleSelect, onClose],
  );

  const categoryLabel = (cat: string) => {
    switch (cat) {
      case "action": return "Actions";
      case "repo": return "Repositories";
      case "node": return "Documents";
      default: return "";
    }
  };

  // Group by category for section headers
  let lastCategory = "";

  return (
    <div className="cmd-overlay" onMouseDown={onClose}>
      <div className="cmd-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-input"
          type="text"
          placeholder="Search documents, repos, or actions..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="cmd-list" ref={listRef}>
          {items.length === 0 && (
            <div className="cmd-empty">No results</div>
          )}
          {items.map((item, i) => {
            const showHeader = item.category !== lastCategory;
            lastCategory = item.category;
            return (
              <React.Fragment key={item.id}>
                {showHeader && (
                  <div className="cmd-category">{categoryLabel(item.category)}</div>
                )}
                <div
                  className={`cmd-item${i === activeIndex ? " cmd-item-active" : ""}`}
                  onMouseDown={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span className={`cmd-item-icon cmd-icon-${item.category}`}>
                    {item.category === "action" ? "\u2318" : item.category === "repo" ? "\u25A0" : "\u25CF"}
                  </span>
                  <span className="cmd-item-label">{item.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
