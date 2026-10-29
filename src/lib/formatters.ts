/**
 * Formatting utilities for freight procurement figures, dates, and status codes.
 */

export { deriveEffectiveAuctionStatus, type AuctionStatus } from "@/modules/auction.engine";

export function formatCurrency(
  value: string | number | null | undefined,
  currency = "INR",
): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) {
    return "—";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatNumber(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function getLocalTimeZoneAbbreviation(): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", { timeZoneName: "short" });
    const parts = formatter.formatToParts(new Date(1770000000000));
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart ? tzPart.value : "";
  } catch {
    return "";
  }
}

export function formatDateTime(
  dateValue: string | Date | null | undefined,
  includeSeconds = true,
  includeTimezone = true,
): string {
  if (!dateValue) return "—";
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  if (isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    hour12: false,
    timeZoneName: includeTimezone ? "short" : undefined,
  }).format(date);
}

export function formatDateOnly(
  dateValue: string | Date | null | undefined,
): string {
  if (!dateValue) return "—";
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  if (isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTimeRemaining(
  targetDateValue: string | Date | null | undefined,
  referenceNow = new Date(),
): { label: string; isPast: boolean; totalSeconds: number } {
  if (!targetDateValue) {
    return { label: "—", isPast: true, totalSeconds: 0 };
  }

  const targetDate =
    typeof targetDateValue === "string"
      ? new Date(targetDateValue)
      : targetDateValue;
  const diffMs = targetDate.getTime() - referenceNow.getTime();

  if (diffMs <= 0) {
    return { label: "Closed", isPast: true, totalSeconds: 0 };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${seconds.toString().padStart(2, "0")}s`);

  return {
    label: parts.join(" "),
    isPast: false,
    totalSeconds,
  };
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "SCHEDULED":
      return "Scheduled";
    case "CLOSED":
      return "Closed";
    case "FORCE_CLOSED":
      return "Force Closed";
    default:
      return status;
  }
}

