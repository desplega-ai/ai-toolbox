import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { TrendChart } from "./TrendChart";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HistoryModal({ isOpen, onClose }: HistoryModalProps) {
  const allData = useQuery(api.votes.getAllDailyAverages);

  if (!isOpen) return null;

  const totalVotes = allData?.reduce((sum, d) => sum + d.count, 0) ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 rounded-xl w-full max-w-5xl max-h-[90vh] mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-white">Doom History</h2>
            {allData && allData.length > 0 && (
              <p className="text-white/40 text-sm mt-1">
                {allData.length} days • {totalVotes.toLocaleString()} total votes
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
          >
            ×
          </button>
        </div>

        <div className="h-[500px] p-6">
          {allData ? (
            allData.length > 0 ? (
              <TrendChart data={allData} faded={false} />
            ) : (
              <div className="flex items-center justify-center h-full text-white/40">
                No voting data yet
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-full text-white/40">
              Loading...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
