import React from "react";
import { AuctionStatus } from "@/lib/api";

interface StatusBadgeProps {
  status: AuctionStatus;
  size?: "sm" | "md";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = "md",
}) => {
  const isSm = size === "sm";

  switch (status) {
    case "ACTIVE":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded border ${
            isSm ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs"
          } bg-[#0c261e] border-[#10b981]/40 text-[#34d399]`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
          Active
        </span>
      );
    case "SCHEDULED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded border ${
            isSm ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs"
          } bg-[#181d28] border-[#384152] text-[#94a3b8]`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#64748b]" />
          Scheduled
        </span>
      );
    case "CLOSED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded border ${
            isSm ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs"
          } bg-[#14151a] border-[#292c36] text-[#6b7280]`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#4b5563]" />
          Closed
        </span>
      );
    case "FORCE_CLOSED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded border ${
            isSm ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs"
          } bg-[#281215] border-[#dc2626]/40 text-[#f87171]`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#dc2626]" />
          Force Closed
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded border ${
            isSm ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs"
          } bg-[#14151a] border-[#292c36] text-[#9e9ea7]`}
        >
          {status}
        </span>
      );
  }
};

