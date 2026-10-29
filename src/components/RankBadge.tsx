import React from "react";

interface RankBadgeProps {
  rank: number | null | undefined;
}

export const RankBadge: React.FC<RankBadgeProps> = ({ rank }) => {
  if (rank === null || rank === undefined) {
    return <span className="text-[#646877] font-mono text-xs">—</span>;
  }

  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-[#0c261e] border border-[#10b981]/50 text-[#34d399] font-mono tracking-tight shadow-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
        L1
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-[#16181f] border border-[#2b2e3a] text-[#9ea2b0] font-mono">
      L{rank}
    </span>
  );
};

