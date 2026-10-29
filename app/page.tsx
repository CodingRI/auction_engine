"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { StatusBadge } from "@/components/StatusBadge";
import { Countdown } from "@/components/Countdown";
import { api, AuctionSummary, AuctionStatus } from "@/lib/api";
import {
  formatCurrency,
  formatDateTime,
  formatDateOnly,
  deriveEffectiveAuctionStatus,
} from "@/lib/formatters";
import {
  RotateCw,
  Search,
  ArrowRight,
  TrendingDown,
  Clock,
  Layers,
  AlertCircle,
  Plus,
  Loader2,
} from "lucide-react";

function DashboardContent() {
  const [auctions, setAuctions] = useState<AuctionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isAdmin, setIsAdmin] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // Client-side clock tracking (runs inside useEffect to prevent prerender hydration mismatches)
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAuctions = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setError(null);

    try {
      const [auctionRes, authRes] = await Promise.allSettled([
        api.getAuctions(),
        api.getAuthSession(),
      ]);

      if (auctionRes.status === "fulfilled") {
        setAuctions(auctionRes.value.data);
        setLastRefreshedAt(new Date());
      } else {
        const message =
          auctionRes.reason instanceof Error
            ? auctionRes.reason.message
            : "Failed to load auctions from backend";
        setError(message);
      }

      if (authRes.status === "fulfilled") {
        setIsAdmin(authRes.value.authenticated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAuctions();
  }, [fetchAuctions]);

  // Periodic polling (every 15 seconds) when auto-refresh is active
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchAuctions(false);
    }, 15000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchAuctions]);

  // Derive operational status considering wall-clock time and deadlines
  const auctionsWithEffectiveStatus = useMemo(() => {
    return auctions.map((a) => {
      const effectiveStatus: AuctionStatus = currentTime
        ? deriveEffectiveAuctionStatus(
            {
              status: a.status,
              startAt: a.startAt,
              currentCloseAt: a.currentCloseAt,
              forcedCloseAt: a.forcedCloseAt,
            },
            currentTime,
          )
        : a.status;
      return {
        ...a,
        effectiveStatus,
      };
    });
  }, [auctions, currentTime]);

  // Derived operational statistics strictly calculated from effective status
  const stats = useMemo(() => {
    const total = auctionsWithEffectiveStatus.length;
    let active = 0;
    let scheduled = 0;
    let closed = 0;

    for (const a of auctionsWithEffectiveStatus) {
      if (a.effectiveStatus === "ACTIVE") active++;
      else if (a.effectiveStatus === "SCHEDULED") scheduled++;
      else if (a.effectiveStatus === "CLOSED" || a.effectiveStatus === "FORCE_CLOSED") closed++;
    }

    return { total, active, scheduled, closed };
  }, [auctionsWithEffectiveStatus]);

  // Filtered auctions based on user search & status tabs
  const filteredAuctions = useMemo(() => {
    return auctionsWithEffectiveStatus.filter((a) => {
      if (statusFilter !== "ALL") {
        if (statusFilter === "CLOSED") {
          if (a.effectiveStatus !== "CLOSED" && a.effectiveStatus !== "FORCE_CLOSED") {
            return false;
          }
        } else if (a.effectiveStatus !== statusFilter) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesRef = a.referenceId.toLowerCase().includes(query);
        const matchesName = a.name.toLowerCase().includes(query);
        const matchesOrigin = a.origin?.toLowerCase().includes(query);
        const matchesDest = a.destination?.toLowerCase().includes(query);
        return matchesRef || matchesName || matchesOrigin || matchesDest;
      }

      return true;
    });
  }, [auctionsWithEffectiveStatus, statusFilter, searchQuery]);

  return (
    <div className="min-h-screen flex flex-col bg-[#090a0c] text-[#ededed]">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page title and action bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1f222b] pb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#ededed]">
                Freight Procurement Auctions
              </h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#161821] border border-[#262936] text-[#9ea2b0]">
                BRITISH MODEL
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-[#9ea2b0]">
              Operational British reverse auctions with dynamic anti-sniping trigger windows and immutable forced close caps.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Polling toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono transition-colors border ${
                autoRefresh
                  ? "bg-[#0c241c] border-[#10b981]/30 text-[#34d399]"
                  : "bg-[#14161c] border-[#262936] text-[#646877]"
              }`}
              title="Toggle background 15-second polling"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  autoRefresh ? "bg-[#10b981] animate-pulse" : "bg-[#4b5563]"
                }`}
              />
              <span>{autoRefresh ? "Polling (15s): Active" : "Polling: Paused"}</span>
            </button>

            {/* Manual refresh button */}
            <button
              type="button"
              onClick={() => fetchAuctions(true)}
              disabled={refreshing || loading}
              aria-label="Refresh auctions list"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#14161c] hover:bg-[#1a1d26] border border-[#262936] text-[#9ea2b0] hover:text-[#ededed] transition-colors disabled:opacity-50"
            >
              <RotateCw
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#ededed]" : ""}`}
              />
              <span>Refresh</span>
            </button>

            {isAdmin && (
              <Link
                href="/auctions/new"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#dc2626] hover:bg-[#ef4444] text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New RFQ</span>
              </Link>
            )}
          </div>
        </div>

        {/* Compact summary metrics derived strictly from effective status */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded border border-[#1f222b] bg-[#101217]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#9ea2b0] uppercase tracking-wider font-mono">
                Total Auctions
              </span>
              <Layers className="w-4 h-4 text-[#646877]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-[#ededed]">
                {loading ? "—" : stats.total}
              </span>
              <span className="text-[11px] text-[#646877]">recorded</span>
            </div>
          </div>

          <div className="p-4 rounded border border-[#10b981]/25 bg-[#0b1b16]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#34d399] uppercase tracking-wider font-mono">
                Active Bidding
              </span>
              <span className="w-2 h-2 rounded-full bg-[#10b981]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-[#34d399]">
                {loading ? "—" : stats.active}
              </span>
              <span className="text-[11px] text-[#10b981]/70">within deadline</span>
            </div>
          </div>

          <div className="p-4 rounded border border-[#1f222b] bg-[#101217]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider font-mono">
                Scheduled
              </span>
              <Clock className="w-4 h-4 text-[#64748b]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-[#94a3b8]">
                {loading ? "—" : stats.scheduled}
              </span>
              <span className="text-[11px] text-[#646877]">pending start</span>
            </div>
          </div>

          <div className="p-4 rounded border border-[#1f222b] bg-[#101217]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#64748b] uppercase tracking-wider font-mono">
                Closed / Final
              </span>
              <TrendingDown className="w-4 h-4 text-[#64748b]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-[#64748b]">
                {loading ? "—" : stats.closed}
              </span>
              <span className="text-[11px] text-[#646877]">deadline reached</span>
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0e1014] p-2.5 rounded border border-[#1f222b]">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: "ALL", label: "All Auctions", count: stats.total },
              { id: "ACTIVE", label: "Active", count: stats.active },
              { id: "SCHEDULED", label: "Scheduled", count: stats.scheduled },
              { id: "CLOSED", label: "Closed", count: stats.closed },
            ].map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`text-xs px-3 py-1.5 rounded font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    active
                      ? "bg-[#1c1f29] text-[#ededed] border border-[#2f3344]"
                      : "text-[#9ea2b0] hover:text-[#ededed] hover:bg-[#14161c]"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                      active
                        ? "bg-[#272b3a] text-[#ededed]"
                        : "bg-[#161820] text-[#646877]"
                    }`}
                  >
                    {loading ? "·" : tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search box & last refresh indicator */}
          <div className="flex items-center gap-3">
            {lastRefreshedAt && (
              <span className="hidden md:inline text-[11px] font-mono text-[#646877]">
                Synced: {formatDateTime(lastRefreshedAt, true, true)}
              </span>
            )}
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#646877]" />
              <input
                type="text"
                placeholder="Search reference, route..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#12141a] border border-[#232634] rounded text-[#ededed] placeholder-[#646877] focus:outline-none focus:border-[#dc2626]/60 transition-colors font-mono"
              />
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded border border-[#dc2626]/30 bg-[#241215] text-[#fca5a5] flex items-start gap-3">
            <AlertCircle className="w-4 h-4 mt-0.5 text-[#ef4444] shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-[#f87171]">Unable to load auctions</p>
              <p className="mt-0.5 text-[#fca5a5]">{error}</p>
              <button
                type="button"
                onClick={() => fetchAuctions(true)}
                className="mt-2 text-xs font-medium underline text-white hover:text-zinc-200"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Operational Table */}
        <div className="rounded border border-[#1f222b] bg-[#0d0f13] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1f222b] bg-[#12141a] text-[#8e92a2] uppercase tracking-wider font-mono text-[11px]">
                  <th className="py-3 px-4 font-semibold">Ref ID</th>
                  <th className="py-3 px-4 font-semibold">RFQ Name</th>
                  <th className="py-3 px-4 font-semibold">Route</th>
                  <th className="py-3 px-4 font-semibold">Pickup Date</th>
                  <th className="py-3 px-4 font-semibold text-right">L1 Lowest Quote</th>
                  <th className="py-3 px-4 font-semibold">Current Deadline</th>
                  <th className="py-3 px-4 font-semibold">Forced Deadline</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#191b22]">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-4 px-4"><div className="h-3 w-20 bg-[#1c1f2a] rounded" /></td>
                      <td className="py-4 px-4"><div className="h-3 w-32 bg-[#1c1f2a] rounded" /></td>
                      <td className="py-4 px-4"><div className="h-3 w-24 bg-[#1c1f2a] rounded" /></td>
                      <td className="py-4 px-4"><div className="h-3 w-16 bg-[#1c1f2a] rounded" /></td>
                      <td className="py-4 px-4 text-right"><div className="h-3 w-20 bg-[#1c1f2a] rounded ml-auto" /></td>
                      <td className="py-4 px-4"><div className="h-3 w-24 bg-[#1c1f2a] rounded" /></td>
                      <td className="py-4 px-4"><div className="h-3 w-24 bg-[#1c1f2a] rounded" /></td>
                      <td className="py-4 px-4"><div className="h-5 w-16 bg-[#1c1f2a] rounded" /></td>
                      <td className="py-4 px-4 text-right"><div className="h-6 w-16 bg-[#1c1f2a] rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredAuctions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 px-4 text-center">
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-2">
                        <Layers className="w-8 h-8 text-[#414555]" />
                        <p className="text-sm font-medium text-[#ededed]">No auctions found</p>
                        <p className="text-xs text-[#646877]">
                          {searchQuery
                            ? `No results match query "${searchQuery}". Try a different search term or clear the filter.`
                            : statusFilter !== "ALL"
                            ? `There are currently no auctions in ${statusFilter.toLowerCase()} state.`
                            : "No procurement auctions have been created yet."}
                        </p>
                        {isAdmin && (
                          <Link
                            href="/auctions/new"
                            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#dc2626] hover:bg-[#ef4444] text-white transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Create First RFQ</span>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAuctions.map((auction) => {
                    const hasRoute = Boolean(auction.origin || auction.destination);
                    const routeStr = hasRoute
                      ? `${auction.origin || "Origin"} → ${auction.destination || "Destination"}`
                      : "Route not specified";

                    return (
                      <tr
                        key={auction.id}
                        className="hover:bg-[#12141b] transition-colors group"
                      >
                        {/* Reference ID */}
                        <td className="py-3 px-4 font-mono font-medium text-[#ededed]">
                          <Link
                            href={`/auctions/${auction.id}`}
                            className="hover:text-[#ef4444] hover:underline"
                          >
                            {auction.referenceId}
                          </Link>
                        </td>

                        {/* RFQ Name */}
                        <td className="py-3 px-4 font-medium text-[#ededed]">
                          <Link
                            href={`/auctions/${auction.id}`}
                            className="hover:text-white"
                          >
                            {auction.name}
                          </Link>
                        </td>

                        {/* Route */}
                        <td className="py-3 px-4 text-[#9ea2b0]">
                          <span className="font-mono text-[11px] text-[#9ea2b0] bg-[#161821] px-1.5 py-0.5 rounded border border-[#232634]">
                            {routeStr}
                          </span>
                        </td>

                        {/* Pickup Date */}
                        <td className="py-3 px-4 text-[#9ea2b0] font-mono text-[11px]">
                          {formatDateOnly(auction.pickupServiceAt)}
                        </td>

                        {/* Lowest Quote */}
                        <td className="py-3 px-4 text-right font-mono">
                          {auction.lowestBid !== null ? (
                            <span className="font-semibold text-[#34d399]">
                              {formatCurrency(auction.lowestBid)}
                            </span>
                          ) : (
                            <span className="text-[#646877] italic text-[11px]">
                              Unavailable
                            </span>
                          )}
                        </td>

                        {/* Current Deadline with Countdown if Active */}
                        <td className="py-3 px-4 font-mono text-[11px]">
                          <div className="flex flex-col">
                            <span className="text-[#ededed]">
                              {formatDateTime(auction.currentCloseAt, false, true)}
                            </span>
                            {auction.effectiveStatus === "ACTIVE" ? (
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[10px] text-[#646877]">rem:</span>
                                <Countdown
                                  targetDate={auction.currentCloseAt}
                                  status={auction.effectiveStatus}
                                />
                              </div>
                            ) : (
                              <span className="text-[10px] text-[#646877] mt-0.5">
                                {auction.effectiveStatus === "FORCE_CLOSED"
                                  ? "Forced close cap reached"
                                  : "Bidding window passed"}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Forced Deadline */}
                        <td className="py-3 px-4 font-mono text-[11px] text-[#9ea2b0]">
                          <div className="flex flex-col">
                            <span>{formatDateTime(auction.forcedCloseAt, false, true)}</span>
                            <span className="text-[10px] text-[#646877]">Hard cap</span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          <StatusBadge status={auction.effectiveStatus} size="sm" />
                        </td>

                        {/* Action link */}
                        <td className="py-3 px-4 text-right">
                          <Link
                            href={`/auctions/${auction.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-[#161822] hover:bg-[#1f2230] border border-[#2b2e3e] text-[#ededed] group-hover:border-[#3e4359] transition-colors"
                          >
                            <span>Open</span>
                            <ArrowRight className="w-3 h-3 text-[#9ea2b0] group-hover:translate-x-0.5 transition-transform" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Operational Footer info */}
        <div className="pt-4 border-t border-[#1c1f26] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#646877] font-mono">
          <div>
            {autoRefresh ? "Polling: 15s active" : "Polling: paused"} • Local timezone displayed
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col bg-[#090a0c] text-[#ededed]">
          <header className="w-full border-b border-[#232630] bg-[#0c0d10] h-14" />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-16 flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs font-mono text-[#9ea2b0]">
              <Loader2 className="w-4 h-4 animate-spin text-[#dc2626]" />
              <span>Loading auction overview...</span>
            </div>
          </main>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
