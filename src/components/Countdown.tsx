"use client";

import React, { useEffect, useState } from "react";
import { formatTimeRemaining } from "@/lib/formatters";

interface CountdownProps {
  targetDate: string | Date;
  status?: string;
  className?: string;
}

export const Countdown: React.FC<CountdownProps> = ({
  targetDate,
  status,
  className = "",
}) => {
  const [remaining, setRemaining] = useState<{
    label: string;
    isPast: boolean;
    totalSeconds: number;
  }>({
    label: "—",
    isPast: false,
    totalSeconds: 0,
  });

  useEffect(() => {
    // Initial calculation once mounted on client
    setRemaining(formatTimeRemaining(targetDate, new Date()));

    if (status === "CLOSED" || status === "FORCE_CLOSED") {
      return;
    }

    const interval = setInterval(() => {
      const updated = formatTimeRemaining(targetDate, new Date());
      setRemaining(updated);
      if (updated.isPast) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate, status]);

  if (status === "FORCE_CLOSED") {
    return (
      <span className={`text-[#f87171] font-mono text-xs ${className}`}>
        Force Closed
      </span>
    );
  }

  if (status === "CLOSED") {
    return (
      <span className={`text-[#646877] font-mono text-xs ${className}`}>
        Closed
      </span>
    );
  }

  if (remaining.isPast) {
    return (
      <span className={`text-[#646877] font-mono text-xs ${className}`}>
        Closed
      </span>
    );
  }

  // Under 5 minutes warning
  const isUrgent = remaining.totalSeconds > 0 && remaining.totalSeconds < 300;

  return (
    <span
      className={`font-mono text-xs font-medium ${
        isUrgent ? "text-[#f59e0b] animate-pulse" : "text-[#ededed]"
      } ${className}`}
    >
      {remaining.label}
    </span>
  );
};
