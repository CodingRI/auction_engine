"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { StatusBadge } from "@/components/StatusBadge";
import { RankBadge } from "@/components/RankBadge";
import { Countdown } from "@/components/Countdown";
import {
  api,
  AuctionDetail,
  SupplierInfo,
  SubmitBidResult,
  ApiError,
  AuctionStatus,
} from "@/lib/api";
import {
  formatCurrency,
  formatDateTime,
  formatDateOnly,
  formatNumber,
  deriveEffectiveAuctionStatus,
  getLocalTimeZoneAbbreviation,
} from "@/lib/formatters";
import {
  ArrowLeft,
  RotateCw,
  Clock,
  Truck,
  Send,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
} from "lucide-react";

export default function AuctionDetailView({ id }: { id: string }) {
  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Demo bid testing panel state
  const [suppliers, setSuppliers] = useState<SupplierInfo[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [freightCharge, setFreightCharge] = useState("");
  const [originCharge, setOriginCharge] = useState("2000");
  const [destinationCharge, setDestinationCharge] = useState("2500");
  const [transitTimeHours, setTransitTimeHours] = useState("48");
  const [validUntil, setValidUntil] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidSuccess, setBidSuccess] = useState<SubmitBidResult | null>(null);
  const [showBidDrawer, setShowBidDrawer] = useState(false);

  // Fetch auction details from backend
  const fetchAuction = useCallback(
    async (isManual = false) => {
      if (!id) return;
      if (isManual) setRefreshing(true);
      setError(null);

      try {
        const res = await api.getAuction(id);
        setAuction(res.data);
        setLastRefreshedAt(new Date());
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setError("Auction not found. It may have been removed or the ID is invalid.");
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to fetch auction details");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  // Initial fetch and periodic polling (every 8 seconds when active)
  useEffect(() => {
    fetchAuction();

    const interval = setInterval(() => {
      if (autoRefresh) {
        fetchAuction(false);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [fetchAuction, autoRefresh]);

  // Derive operational status considering deadlines and hard caps
  const effectiveStatus: AuctionStatus = useMemo(() => {
    if (!auction) return "CLOSED";
    return currentTime
      ? deriveEffectiveAuctionStatus(
          {
            status: auction.status,
            startAt: auction.startAt,
            currentCloseAt: auction.currentCloseAt,
            forcedCloseAt: auction.forcedCloseAt,
          },
          currentTime,
        )
      : auction.status;
  }, [auction, currentTime]);

  const isOpen = effectiveStatus === "ACTIVE";

  // Fetch available real suppliers for the demo testing tool
  useEffect(() => {
    async function loadSuppliers() {
      try {
        const res = await api.getSuppliers();
        setSuppliers(res.data);
        if (res.data.length > 0) {
          setSelectedSupplierId(res.data[0].id);
        }
      } catch {
        // Handled silently
      }
    }
    loadSuppliers();

    // Default validity date to 7 days in future
    const defDate = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dStr = `${defDate.getFullYear()}-${pad(defDate.getMonth() + 1)}-${pad(
      defDate.getDate(),
    )}T${pad(defDate.getHours())}:${pad(defDate.getMinutes())}`;
    setValidUntil(dStr);
  }, []);

  // Compute calculated total for testing panel
  const calculatedTotal = useMemo(() => {
    const f = parseFloat(freightCharge) || 0;
    const o = parseFloat(originCharge) || 0;
    const d = parseFloat(destinationCharge) || 0;
    return f + o + d;
  }, [freightCharge, originCharge, destinationCharge]);

  // Handle demo bid submission through existing auction service
  const handleBidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBidError(null);
    setBidSuccess(null);

    if (!isOpen) {
      setBidError(
        `Auction is not currently open for bidding (${
          effectiveStatus === "FORCE_CLOSED" ? "Force Closed" : "Closed"
        }).`,
      );
      return;
    }

    if (!selectedSupplierId) {
      setBidError("Please select a registered supplier.");
      return;
    }

    const f = parseFloat(freightCharge);
    const o = parseFloat(originCharge);
    const d = parseFloat(destinationCharge);
    const t = parseInt(transitTimeHours, 10);

    if (isNaN(f) || f <= 0) {
      setBidError("Freight charge must be a positive number.");
      return;
    }
    if (isNaN(o) || o < 0) {
      setBidError("Origin charge cannot be negative.");
      return;
    }
    if (isNaN(d) || d < 0) {
      setBidError("Destination charge cannot be negative.");
      return;
    }
    if (isNaN(t) || t <= 0) {
      setBidError("Transit time must be at least 1 hour.");
      return;
    }
    if (!validUntil) {
      setBidError("Quote validity expiration date is required.");
      return;
    }

    setSubmittingBid(true);

    try {
      const res = await api.submitBid(id, {
        supplierId: selectedSupplierId,
        freightCharge: f,
        originCharge: o,
        destinationCharge: d,
        transitTimeHours: t,
        validUntil: new Date(validUntil).toISOString(),
      });

      setBidSuccess(res.data);
      // Immediately re-fetch auction data to update rankings & deadlines
      await fetchAuction(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setBidError(err.message);
      } else if (err instanceof Error) {
        setBidError(err.message);
      } else {
        setBidError("Failed to submit quote.");
      }
    } finally {
      setSubmittingBid(false);
    }
  };

  // Find current L1 quote
  const currentL1Bid = useMemo(() => {
    if (!auction?.bids || auction.bids.length === 0) return null;
    return auction.bids.find((b) => b.rank === 1) || auction.bids[0];
  }, [auction?.bids]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#090a0c] text-[#ededed]">
        <Header />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-16 flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs font-mono text-[#9ea2b0]">
            <Loader2 className="w-4 h-4 animate-spin text-[#dc2626]" />
            <span>Loading auction parameters and quote book...</span>
          </div>
        </main>
      </div>
    );
  }

  if (error || !auction) {
    return (
      <div className="min-h-screen flex flex-col bg-[#090a0c] text-[#ededed]">
        <Header />
        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-16 flex flex-col items-center justify-center">
          <div className="w-full p-6 rounded border border-[#2b2e3e] bg-[#101217] text-center space-y-4">
            <div className="w-10 h-10 rounded-full bg-[#241215] border border-[#dc2626]/40 flex items-center justify-center mx-auto text-[#ef4444]">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#ededed]">Auction Unavailable</h2>
              <p className="mt-1 text-xs text-[#8d92a4]">
                {error || "The requested auction could not be retrieved from the database."}
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-medium bg-[#161821] hover:bg-[#1e202b] border border-[#282b3a] text-[#ededed] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Auction Dashboard</span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const tzLabel = getLocalTimeZoneAbbreviation();

  return (
    <div className="min-h-screen flex flex-col bg-[#090a0c] text-[#ededed]">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation & Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-[#9ea2b0]">
            <Link
              href="/"
              className="inline-flex items-center gap-1 hover:text-[#ededed] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Auctions</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-[#414556]" />
            <span className="font-mono text-[#ededed]">{auction.referenceId}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {lastRefreshedAt && (
              <span className="text-[11px] font-mono text-[#646877] hidden md:inline">
                Synced: {formatDateTime(lastRefreshedAt, true, true)}
              </span>
            )}

            {/* Polling toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs px-2.5 py-1 rounded border font-mono transition-colors flex items-center gap-1.5 ${
                autoRefresh
                  ? "bg-[#10241e] border-[#10b981]/40 text-[#34d399]"
                  : "bg-[#14161c] border-[#242734] text-[#646877]"
              }`}
              title="Toggle background 8-second HTTP polling"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  autoRefresh ? "bg-[#10b981] animate-pulse" : "bg-[#4b5563]"
                }`}
              />
              <span>{autoRefresh ? "Polling (8s): Active" : "Polling: Paused"}</span>
            </button>

            {/* Manual refresh button */}
            <button
              type="button"
              onClick={() => fetchAuction(true)}
              disabled={refreshing}
              aria-label="Refresh auction details"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[#14161c] hover:bg-[#1a1d26] border border-[#242734] text-[#9ea2b0] hover:text-[#ededed] transition-colors disabled:opacity-50"
            >
              <RotateCw
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#ededed]" : ""}`}
              />
              <span>Refresh</span>
            </button>

            {/* Trigger testing drawer toggle */}
            <button
              type="button"
              onClick={() => setShowBidDrawer(!showBidDrawer)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-medium bg-[#1c1e28] hover:bg-[#252837] border border-[#34384a] text-[#ededed] transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-[#dc2626]" />
              <span>{showBidDrawer ? "Hide Bid Tool" : "Submit Quote (Demo Tool)"}</span>
            </button>
          </div>
        </div>

        {/* Hero Section: Auction Overview */}
        <div className="rounded border border-[#1f222b] bg-[#101217] p-5 sm:p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-[#1f222b] pb-5">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#161822] border border-[#282b3a] text-[#9ea2b0]">
                  {auction.referenceId}
                </span>
                <StatusBadge status={effectiveStatus} />
                {isOpen ? (
                  <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-[#1f1315] border border-[#dc2626]/30 text-[#fca5a5]">
                    <Clock className="w-3 h-3 text-[#ef4444]" />
                    <Countdown
                      targetDate={auction.currentCloseAt}
                      status={effectiveStatus}
                    />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-[#161821] border border-[#282b3a] text-[#8d92a4]">
                    <Clock className="w-3 h-3 text-[#646877]" />
                    <span>
                      {effectiveStatus === "FORCE_CLOSED"
                        ? "Forced Close Cap Reached"
                        : "Bidding Deadline Closed"}
                    </span>
                  </span>
                )}
              </div>
              <h1 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-[#ededed]">
                {auction.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#9ea2b0]">
                <span className="font-mono text-[#ededed] bg-[#161821] px-2 py-0.5 rounded border border-[#232634]">
                  Corridor: {auction.origin || "Origin"} → {auction.destination || "Destination"}
                </span>
                <span>•</span>
                <span>
                  Target Service:{" "}
                  <strong className="text-[#ededed] font-mono">
                    {formatDateOnly(auction.pickupServiceAt)}
                  </strong>
                </span>
                {tzLabel && (
                  <>
                    <span>•</span>
                    <span className="text-[#646877] font-mono">Timezone: {tzLabel}</span>
                  </>
                )}
              </div>
            </div>

            {/* Current L1 Summary Box */}
            <div className="p-3.5 rounded border border-[#10b981]/30 bg-[#0b1c17] flex flex-col justify-between min-w-[220px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-[#34d399] tracking-wider font-semibold">
                  Current L1 Lowest Quote
                </span>
                <span className="w-2 h-2 rounded-full bg-[#10b981]" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-mono font-bold text-[#34d399]">
                  {currentL1Bid ? formatCurrency(currentL1Bid.totalAmount) : "—"}
                </div>
                <div className="mt-0.5 text-[11px] text-[#10b981]/80 font-mono">
                  {currentL1Bid
                    ? `Held by ${currentL1Bid.supplier.name} (${currentL1Bid.supplier.code})`
                    : "No quotes submitted yet"}
                </div>
              </div>
            </div>
          </div>

          {/* Operational Metrics Ribbon */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 pt-1">
            <div className="p-3 rounded bg-[#14161e] border border-[#1f222d]">
              <span className="text-[10px] uppercase font-mono text-[#646877] block">
                Auction Start ({tzLabel || "Local"})
              </span>
              <span className="mt-1 text-xs font-mono font-medium text-[#ededed] block">
                {formatDateTime(auction.startAt, true, true)}
              </span>
            </div>

            <div className="p-3 rounded bg-[#14161e] border border-[#1f222d]">
              <span className="text-[10px] uppercase font-mono text-[#646877] block">
                Initial Deadline ({tzLabel || "Local"})
              </span>
              <span className="mt-1 text-xs font-mono font-medium text-[#ededed] block">
                {formatDateTime(auction.initialCloseAt, true, true)}
              </span>
            </div>

            <div
              className={`p-3 rounded bg-[#14161e] border ${
                isOpen ? "border-[#10b981]/30" : "border-[#1f222d]"
              }`}
            >
              <span
                className={`text-[10px] uppercase font-mono block ${
                  isOpen ? "text-[#34d399]" : "text-[#646877]"
                }`}
              >
                Current Active Deadline ({tzLabel || "Local"})
              </span>
              <span
                className={`mt-1 text-xs font-mono font-semibold block ${
                  isOpen ? "text-[#34d399]" : "text-[#ededed]"
                }`}
              >
                {formatDateTime(auction.currentCloseAt, true, true)}
              </span>
            </div>

            <div className="p-3 rounded bg-[#14161e] border border-[#2a1316]">
              <span className="text-[10px] uppercase font-mono text-[#f87171] block">
                Forced Close Cap ({tzLabel || "Local"})
              </span>
              <span className="mt-1 text-xs font-mono font-medium text-[#f87171] block">
                {formatDateTime(auction.forcedCloseAt, true, true)}
              </span>
            </div>
          </div>

          {/* British Auction Extension Rules Banner */}
          <div className="p-3.5 rounded bg-[#13151d] border border-[#232736] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#818cf8] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[#ededed]">
                  Anti-Sniping Extension Engine:
                </span>{" "}
                <span className="text-[#9ea2b0]">
                  Trigger window is{" "}
                  <strong className="text-[#ededed] font-mono">
                    {auction.triggerWindowMinutes} min
                  </strong>
                  . Qualifying bid extends deadline by{" "}
                  <strong className="text-[#ededed] font-mono">
                    +{auction.extensionMinutes} min
                  </strong>{" "}
                  (strictly capped at forced close).
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
              <span className="text-[#646877]">Active Triggers:</span>
              {auction.extensionTriggers.length === 0 ? (
                <span className="text-[#646877]">None</span>
              ) : (
                auction.extensionTriggers.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded bg-[#1c1f2b] border border-[#2b3044] text-[#ededed]"
                  >
                    {t === "BID_RECEIVED" && "Bid in Window"}
                    {t === "ANY_RANK_CHANGE" && "Any Rank Shift"}
                    {t === "L1_RANK_CHANGE" && "L1 Lead Inversion"}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Optional Demo Bid Entry Panel (Explicitly Labeled Testing Workflow) */}
        {showBidDrawer && (
          <div className="rounded border border-[#dc2626]/40 bg-[#12131a] p-5 sm:p-6 space-y-4 shadow-lg">
            <div className="flex items-start justify-between border-b border-[#232635] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#ededed] uppercase font-mono tracking-wider">
                    Demo Quote Entry & Extension Simulator
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#2a1316] text-[#f87171] border border-[#dc2626]/40">
                    TESTING TOOL ONLY
                  </span>
                </div>
                <p className="text-xs text-[#8d92a4] mt-0.5">
                  Submits directly to the existing backend auction service (`POST /api/auctions/{id}/bids`) using registered suppliers.
                  No supplier authentication is claimed or simulated.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBidDrawer(false)}
                className="text-xs text-[#9ea2b0] hover:text-[#ededed] font-mono"
              >
                Close [✕]
              </button>
            </div>

            {!isOpen ? (
              <div className="p-4 rounded border border-[#282b3a] bg-[#161821] text-xs text-[#9ea2b0] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0" />
                <span>
                  Quote submission is disabled because this auction is currently{" "}
                  <strong className="text-[#ededed]">
                    {effectiveStatus === "FORCE_CLOSED" ? "Force Closed" : "Closed"}
                  </strong>
                  . Quotes can only be submitted to ACTIVE auctions before the bidding deadline.
                </span>
              </div>
            ) : (
              <form onSubmit={handleBidSubmit} className="space-y-4" noValidate>
                {bidError && (
                  <div className="p-3 rounded border border-[#dc2626]/40 bg-[#251216] text-[#fca5a5] text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" />
                    <span>{bidError}</span>
                  </div>
                )}

                {bidSuccess && (
                  <div className="p-3.5 rounded border border-[#10b981]/40 bg-[#0c241c] text-[#34d399] text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                      <span>
                        Quote Accepted by Engine! Total: {formatCurrency(bidSuccess.bid.totalAmount)}
                      </span>
                    </div>
                    {bidSuccess.extension.extended ? (
                      <p className="text-[#a7f3d0] font-mono text-[11px]">
                        ★ British Extension Triggered! New close deadline:{" "}
                        {formatDateTime(bidSuccess.extension.newCloseAt, true, true)} (Reason:{" "}
                        {bidSuccess.extension.reasons.join(", ")})
                      </p>
                    ) : (
                      <p className="text-[#9ea2b0] text-[11px]">
                        No extension triggered (Quote arrived outside the trigger window, ranking did not trigger extension, or cap was reached).
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Select registered supplier */}
                  <div>
                    <label
                      htmlFor="bid-supplier"
                      className="block text-[11px] font-mono uppercase text-[#c5c8d4] mb-1"
                    >
                      Registered Supplier
                    </label>
                    <select
                      id="bid-supplier"
                      value={selectedSupplierId}
                      onChange={(e) => setSelectedSupplierId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#181a24] border border-[#2b2e3e] rounded text-[#ededed] focus:outline-none focus:border-[#dc2626]"
                    >
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} - {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Freight Charge */}
                  <div>
                    <label
                      htmlFor="bid-freight"
                      className="block text-[11px] font-mono uppercase text-[#c5c8d4] mb-1"
                    >
                      Freight Charge (₹)
                    </label>
                    <input
                      id="bid-freight"
                      type="number"
                      step="0.01"
                      required
                      placeholder="e.g. 45000"
                      value={freightCharge}
                      onChange={(e) => setFreightCharge(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#181a24] border border-[#2b2e3e] rounded text-[#ededed] focus:outline-none focus:border-[#dc2626]"
                    />
                  </div>

                  {/* Origin charge */}
                  <div>
                    <label
                      htmlFor="bid-origin"
                      className="block text-[11px] font-mono uppercase text-[#c5c8d4] mb-1"
                    >
                      Origin Charge (₹)
                    </label>
                    <input
                      id="bid-origin"
                      type="number"
                      step="0.01"
                      value={originCharge}
                      onChange={(e) => setOriginCharge(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#181a24] border border-[#2b2e3e] rounded text-[#ededed] focus:outline-none focus:border-[#dc2626]"
                    />
                  </div>

                  {/* Destination charge */}
                  <div>
                    <label
                      htmlFor="bid-dest"
                      className="block text-[11px] font-mono uppercase text-[#c5c8d4] mb-1"
                    >
                      Dest Charge (₹)
                    </label>
                    <input
                      id="bid-dest"
                      type="number"
                      step="0.01"
                      value={destinationCharge}
                      onChange={(e) => setDestinationCharge(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#181a24] border border-[#2b2e3e] rounded text-[#ededed] focus:outline-none focus:border-[#dc2626]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label
                      htmlFor="bid-transit"
                      className="block text-[11px] font-mono uppercase text-[#c5c8d4] mb-1"
                    >
                      Transit Time (Hours)
                    </label>
                    <input
                      id="bid-transit"
                      type="number"
                      min="1"
                      value={transitTimeHours}
                      onChange={(e) => setTransitTimeHours(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#181a24] border border-[#2b2e3e] rounded text-[#ededed] focus:outline-none focus:border-[#dc2626]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="bid-valid"
                      className="block text-[11px] font-mono uppercase text-[#c5c8d4] mb-1"
                    >
                      Quote Validity Expiry ({tzLabel || "Local"})
                    </label>
                    <input
                      id="bid-valid"
                      type="datetime-local"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#181a24] border border-[#2b2e3e] rounded text-[#ededed] focus:outline-none focus:border-[#dc2626]"
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <div className="text-[11px] text-[#9ea2b0] font-mono mb-1">
                      Computed Quote Total:{" "}
                      <strong className="text-[#ededed]">
                        {formatCurrency(calculatedTotal)}
                      </strong>
                    </div>
                    <button
                      type="submit"
                      disabled={submittingBid}
                      className="py-1.5 px-4 rounded text-xs font-semibold bg-[#dc2626] hover:bg-[#ef4444] text-white flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      {submittingBid ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <span>Transmit Quote to Engine</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Section: Ranked Supplier Quotes Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold font-mono tracking-wider uppercase text-[#ededed]">
                Ranked Supplier Quotes ({auction.bids.length})
              </h2>
              <span className="text-[11px] text-[#646877] font-mono">
                [Calculated by Lowest Total Delivered Price]
              </span>
            </div>
            <span className="text-xs text-[#9ea2b0] font-mono">
              Deterministic tie-breaker: earlier timestamp
            </span>
          </div>

          <div className="rounded border border-[#1f222b] bg-[#0d0f13] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#1f222b] bg-[#12141a] text-[#8e92a2] uppercase tracking-wider font-mono text-[11px]">
                    <th className="py-3 px-4 font-semibold w-16">Rank</th>
                    <th className="py-3 px-4 font-semibold">Supplier</th>
                    <th className="py-3 px-4 font-semibold text-right">Freight (₹)</th>
                    <th className="py-3 px-4 font-semibold text-right">Origin (₹)</th>
                    <th className="py-3 px-4 font-semibold text-right">Dest (₹)</th>
                    <th className="py-3 px-4 font-semibold text-right">Total Quote</th>
                    <th className="py-3 px-4 font-semibold text-center">Transit</th>
                    <th className="py-3 px-4 font-semibold">Valid Until</th>
                    <th className="py-3 px-4 font-semibold">Submitted At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#191b22]">
                  {auction.bids.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 px-4 text-center">
                        <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-1.5">
                          <Truck className="w-8 h-8 text-[#414555]" />
                          <p className="text-sm font-medium text-[#ededed]">No quotes submitted yet</p>
                          <p className="text-xs text-[#646877]">
                            Suppliers will appear here in ranked order as freight bids are transmitted.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    auction.bids.map((bid) => {
                      const isL1 = bid.rank === 1;
                      return (
                        <tr
                          key={bid.id}
                          className={`transition-colors ${
                            isL1
                              ? "bg-[#0b1d17]/50 hover:bg-[#0b1d17]"
                              : "hover:bg-[#12141b]"
                          }`}
                        >
                          {/* Rank */}
                          <td className="py-3 px-4 font-mono">
                            <RankBadge rank={bid.rank} />
                          </td>

                          {/* Supplier */}
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="font-medium text-[#ededed]">
                                {bid.supplier.name}
                              </span>
                              <span className="text-[10px] font-mono text-[#646877]">
                                {bid.supplier.code}
                              </span>
                            </div>
                          </td>

                          {/* Freight Charge */}
                          <td className="py-3 px-4 text-right font-mono text-[#9ea2b0]">
                            {formatNumber(bid.freightCharge)}
                          </td>

                          {/* Origin Charge */}
                          <td className="py-3 px-4 text-right font-mono text-[#9ea2b0]">
                            {formatNumber(bid.originCharge)}
                          </td>

                          {/* Destination Charge */}
                          <td className="py-3 px-4 text-right font-mono text-[#9ea2b0]">
                            {formatNumber(bid.destinationCharge)}
                          </td>

                          {/* Total Quote */}
                          <td className="py-3 px-4 text-right font-mono">
                            <span
                              className={`font-semibold ${
                                isL1 ? "text-[#34d399] text-sm" : "text-[#ededed]"
                              }`}
                            >
                              {formatCurrency(bid.totalAmount)}
                            </span>
                          </td>

                          {/* Transit */}
                          <td className="py-3 px-4 text-center font-mono text-[#9ea2b0]">
                            {bid.transitTimeHours}h
                          </td>

                          {/* Quote validity */}
                          <td className="py-3 px-4 font-mono text-[11px] text-[#8d92a4]">
                            {formatDateTime(bid.validUntil, false, true)}
                          </td>

                          {/* Submitted timestamp */}
                          <td className="py-3 px-4 font-mono text-[11px] text-[#8d92a4]">
                            {formatDateTime(bid.submittedAt, true, true)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Section: Operational Activity & Extension Audit Log */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold font-mono tracking-wider uppercase text-[#ededed]">
                Auction Events & Extension Audit Log ({auction.events.length})
              </h2>
            </div>
            <span className="text-xs text-[#646877] font-mono">
              Immutable timestamped ledger • {tzLabel || "Local Time"}
            </span>
          </div>

          <div className="rounded border border-[#1f222b] bg-[#0d0f13] divide-y divide-[#181a22]">
            {auction.events.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#646877]">
                No operational events recorded yet.
              </div>
            ) : (
              auction.events.map((event) => {
                const isExtended = event.type === "AUCTION_EXTENDED";
                const isClosed =
                  event.type === "AUCTION_CLOSED" ||
                  event.type === "AUCTION_FORCE_CLOSED";

                return (
                  <div
                    key={event.id}
                    className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#11131a] transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 mt-1 sm:mt-0 ${
                          isExtended
                            ? "bg-[#dc2626]"
                            : isClosed
                            ? "bg-[#64748b]"
                            : "bg-[#10b981]"
                        }`}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-xs font-semibold ${
                              isExtended
                                ? "text-[#f87171]"
                                : isClosed
                                ? "text-[#94a3b8]"
                                : "text-[#ededed]"
                            }`}
                          >
                            {event.type.replace(/_/g, " ")}
                          </span>
                          {event.reason && (
                            <span className="text-xs text-[#9ea2b0]">
                              — {event.reason}
                            </span>
                          )}
                        </div>

                        {/* Extension timestamp transition */}
                        {isExtended && event.previousCloseAt && event.newCloseAt && (
                          <div className="mt-0.5 text-[11px] font-mono text-[#a5b4fc] flex items-center gap-1.5">
                            <span>Deadline pushed:</span>
                            <span className="line-through text-[#64748b]">
                              {formatDateTime(event.previousCloseAt, true, true)}
                            </span>
                            <span>→</span>
                            <span className="font-semibold text-[#f87171]">
                              {formatDateTime(event.newCloseAt, true, true)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] font-mono text-[#646877] shrink-0 self-start sm:self-auto">
                      {formatDateTime(event.createdAt, true, true)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
