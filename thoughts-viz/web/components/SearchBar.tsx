import Fuse from "fuse.js";
import React, { useCallback, useMemo, useState } from "react";
import type { GraphNode } from "../../src/types.ts";

interface SearchBarProps {
  nodes: GraphNode[];
  onSelect: (node: GraphNode) => void;
}

export function SearchBar({ nodes, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

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

  const handleSelect = useCallback(
    (node: GraphNode) => {
      onSelect(node);
      setQuery("");
      setFocused(false);
    },
    [onSelect],
  );

  const showResults = focused && results.length > 0;

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search files..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
      />
      {showResults && (
        <div className="search-results">
          {results.map((node) => (
            <div key={node.id} className="search-result" onMouseDown={() => handleSelect(node)}>
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
