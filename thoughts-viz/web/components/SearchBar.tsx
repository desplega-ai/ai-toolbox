import Fuse from "fuse.js";
import React, { useCallback, useMemo, useRef, useState } from "react";
import type { GraphNode } from "../../src/types.ts";
import { getParam, setParam } from "../utils/url.ts";

interface SearchBarProps {
  nodes: GraphNode[];
  onSelect: (node: GraphNode) => void;
}

export function SearchBar({ nodes, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState(() => getParam("q") ?? "");
  const [focused, setFocused] = useState(() => !!getParam("q"));
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query, { limit: 8 }).map((r) => r.item);
  }, [fuse, query]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setParam("q", value || null);
    setActiveIndex(-1);
  }, []);

  const handleSelect = useCallback(
    (node: GraphNode) => {
      onSelect(node);
      setQuery("");
      setParam("q", null);
      setFocused(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    },
    [onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!results.length) return;

      switch (e.key) {
        case "ArrowDown":
        case "Tab": {
          if (e.key === "Tab" && e.shiftKey) return;
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % results.length);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
          break;
        }
        case "Enter": {
          e.preventDefault();
          const idx = activeIndex >= 0 ? activeIndex : 0;
          if (results[idx]) handleSelect(results[idx]);
          break;
        }
        case "Escape": {
          e.preventDefault();
          setFocused(false);
          setActiveIndex(-1);
          inputRef.current?.blur();
          break;
        }
      }
    },
    [results, activeIndex, handleSelect],
  );

  const showResults = focused && results.length > 0;

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search files..."
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        onKeyDown={handleKeyDown}
      />
      {showResults && (
        <div className="search-results">
          {results.map((node, i) => (
            <div
              key={node.id}
              className={`search-result${i === activeIndex ? " search-result-active" : ""}`}
              onMouseDown={() => handleSelect(node)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className={`badge badge-${node.docType}`}>{node.docType}</span>
              <span className="search-result-name">
                {node.filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
