import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface VotingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VotingModal({ isOpen, onClose }: VotingModalProps) {
  const [value, setValue] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const submitVote = useMutation(api.votes.submitVote);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitVote({ value });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 rounded-xl p-8 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Cast your vote</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <label className="block text-white/80 text-center mb-6">
          How doomed are we with AI taking over coding?
        </label>

        <div className="flex items-center gap-4 mb-4">
          <span className="text-white/60 text-sm w-16 text-right">Not at all</span>
          <input
            type="range"
            min="0"
            max="10"
            value={value}
            onChange={(e) => setValue(parseInt(e.target.value))}
            className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
          />
          <span className="text-white/60 text-sm w-16">Completely</span>
        </div>

        <div className="text-center mb-6">
          <span className="text-5xl font-bold text-white">{value}</span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 px-6 bg-white/10 hover:bg-white/20 disabled:bg-white/5
                     text-white font-medium rounded-lg transition-colors
                     disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting..." : "Submit Vote"}
        </button>
      </div>
    </div>
  );
}
