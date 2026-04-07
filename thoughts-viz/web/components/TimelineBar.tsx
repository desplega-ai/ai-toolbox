import React from "react";
import type { TimelineCommit } from "../../src/types.ts";

interface TimelineBarProps {
  commitIndex: number;
  totalCommits: number;
  currentCommit: TimelineCommit | null;
  playing: boolean;
  playbackSpeed: number;
  diffOverlayEnabled: boolean;
  onCommitIndexChange: (index: number) => void;
  onPlayToggle: (playing: boolean) => void;
  onSpeedChange: (speed: number) => void;
  onDiffOverlayToggle: (enabled: boolean) => void;
  onStepForward: () => void;
  onStepBackward: () => void;
}

function relativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function TimelineBar({
  commitIndex,
  totalCommits,
  currentCommit,
  playing,
  playbackSpeed,
  diffOverlayEnabled,
  onCommitIndexChange,
  onPlayToggle,
  onSpeedChange,
  onDiffOverlayToggle,
  onStepForward,
  onStepBackward,
}: TimelineBarProps) {
  const speedLabel = playbackSpeed <= 500 ? "2x" : playbackSpeed <= 1000 ? "1x" : "0.5x";

  return (
    <div className="timeline-bar">
      <div className="timeline-controls">
        <button
          type="button"
          className="timeline-btn"
          onClick={onStepBackward}
          disabled={commitIndex === 0}
          title="Previous commit"
        >
          {"\u25C0"}
        </button>
        <button
          type="button"
          className="timeline-btn play-btn"
          onClick={() => onPlayToggle(!playing)}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? "\u23F8" : "\u25B6"}
        </button>
        <button
          type="button"
          className="timeline-btn"
          onClick={onStepForward}
          disabled={commitIndex >= totalCommits - 1}
          title="Next commit"
        >
          {"\u25B6"}
        </button>
      </div>

      <div className="timeline-slider-container">
        <input
          type="range"
          className="timeline-slider"
          min={0}
          max={totalCommits - 1}
          value={commitIndex}
          onChange={(e) => onCommitIndexChange(Number.parseInt(e.target.value, 10))}
        />
        <div className="timeline-position">
          {commitIndex + 1} / {totalCommits}
        </div>
      </div>

      {currentCommit && (
        <div className="timeline-commit-info">
          <span className="commit-hash">{currentCommit.hash}</span>
          <span className="commit-msg" title={currentCommit.message}>
            {currentCommit.message.length > 40
              ? `${currentCommit.message.slice(0, 40)}...`
              : currentCommit.message}
          </span>
          <span className="commit-date">{relativeDate(currentCommit.date)}</span>
        </div>
      )}

      <div className="timeline-options">
        <label className="diff-toggle" title="Highlight changes from previous commit">
          <input
            type="checkbox"
            checked={diffOverlayEnabled}
            onChange={(e) => onDiffOverlayToggle(e.target.checked)}
          />
          Diff
        </label>
        <button
          type="button"
          className="speed-btn"
          onClick={() => {
            const speeds = [2000, 1000, 500];
            const current = speeds.indexOf(playbackSpeed);
            onSpeedChange(speeds[(current + 1) % speeds.length]!);
          }}
          title="Playback speed"
        >
          {speedLabel}
        </button>
      </div>
    </div>
  );
}
