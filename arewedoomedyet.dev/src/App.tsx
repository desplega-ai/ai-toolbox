import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SentimentDisplay } from "./components/SentimentDisplay";
import { VotingModal } from "./components/VotingModal";
import { TrendChart } from "./components/TrendChart";
import { HistoryModal } from "./components/HistoryModal";

export default function App() {
  const [showVoting, setShowVoting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const stats = useQuery(api.votes.getStats);
  const trendData = useQuery(api.votes.getDailyAverages, { daysBack: 7 });

  const isLoading = stats === undefined;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background chart */}
      {trendData && <TrendChart data={trendData} faded />}

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        {isLoading ? (
          <h1 className="text-4xl font-bold text-white/60">Loading...</h1>
        ) : (
          <>
            <SentimentDisplay
              average={stats.average}
              count={stats.count}
            />
          </>
        )}
      </div>

      {/* Footer with subtle links */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 flex flex-col items-center gap-2">
        <div className="flex justify-center gap-6">
          <button
            onClick={() => setShowVoting(true)}
            className="text-white/30 hover:text-white/60 text-sm transition-colors"
          >
            Vote
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="text-white/30 hover:text-white/60 text-sm transition-colors"
          >
            History
          </button>
        </div>
        <a
          href="https://desplega.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/20 hover:text-white/40 text-xs transition-colors"
        >
          made w 💀 by desplega.ai
        </a>
      </div>

      {/* Modals */}
      <VotingModal
        isOpen={showVoting}
        onClose={() => setShowVoting(false)}
      />
      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}
