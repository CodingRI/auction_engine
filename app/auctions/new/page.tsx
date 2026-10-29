"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { api, ApiError, ExtensionTriggerType } from "@/lib/api";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
  Calendar,
  Clock,
  Sparkles,
} from "lucide-react";

export default function CreateAuctionPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Form fields
  const [referenceId, setReferenceId] = useState("");
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [pickupServiceAt, setPickupServiceAt] = useState("");
  const [startAt, setStartAt] = useState("");
  const [initialCloseAt, setInitialCloseAt] = useState("");
  const [forcedCloseAt, setForcedCloseAt] = useState("");
  const [triggerWindowMinutes, setTriggerWindowMinutes] = useState("10");
  const [extensionMinutes, setExtensionMinutes] = useState("5");
  const [extensionTriggers, setExtensionTriggers] = useState<ExtensionTriggerType[]>([
    "BID_RECEIVED",
    "ANY_RANK_CHANGE",
    "L1_RANK_CHANGE",
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Initialize sensible defaults for date-times in local time
  useEffect(() => {
    const formatForInput = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, "0");
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60_000); // 5 mins ago (active immediately)
    const initial = new Date(now.getTime() + 60 * 60_000); // 1 hour from now
    const forced = new Date(now.getTime() + 120 * 60_000); // 2 hours from now
    const pickup = new Date(now.getTime() + 7 * 24 * 60 * 60_000); // 7 days from now

    setStartAt(formatForInput(start));
    setInitialCloseAt(formatForInput(initial));
    setForcedCloseAt(formatForInput(forced));
    setPickupServiceAt(formatForInput(pickup));
  }, []);

  // Check admin session
  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await api.getAuthSession();
        setIsAdmin(res.authenticated);
      } catch {
        setIsAdmin(false);
      } finally {
        setCheckingAuth(false);
      }
    }
    verifyAuth();
  }, []);

  const handleTriggerToggle = (trigger: ExtensionTriggerType) => {
    setExtensionTriggers((prev) =>
      prev.includes(trigger)
        ? prev.filter((t) => t !== trigger)
        : [...prev, trigger],
    );
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!referenceId.trim()) {
      errors.referenceId = "Reference ID is required (e.g. RFQ-2026-DEL-BOM).";
    } else if (referenceId.length < 3) {
      errors.referenceId = "Reference ID must be at least 3 characters.";
    }

    if (!name.trim()) {
      errors.name = "RFQ name is required.";
    }

    if (!pickupServiceAt) {
      errors.pickupServiceAt = "Pickup / service date is required.";
    }

    if (!startAt) {
      errors.startAt = "Start time is required.";
    }

    if (!initialCloseAt) {
      errors.initialCloseAt = "Initial close time is required.";
    }

    if (!forcedCloseAt) {
      errors.forcedCloseAt = "Forced close time is required.";
    }

    if (startAt && initialCloseAt) {
      const s = new Date(startAt).getTime();
      const i = new Date(initialCloseAt).getTime();
      if (s >= i) {
        errors.initialCloseAt = "Initial close time must be strictly after start time.";
      }
    }

    if (initialCloseAt && forcedCloseAt) {
      const i = new Date(initialCloseAt).getTime();
      const f = new Date(forcedCloseAt).getTime();
      if (i >= f) {
        errors.forcedCloseAt = "Forced close time must be strictly after initial close time.";
      }
    }

    const windowMin = parseInt(triggerWindowMinutes, 10);
    if (isNaN(windowMin) || windowMin < 1 || windowMin > 1440) {
      errors.triggerWindowMinutes = "Window must be between 1 and 1440 minutes.";
    }

    const extMin = parseInt(extensionMinutes, 10);
    if (isNaN(extMin) || extMin < 1 || extMin > 1440) {
      errors.extensionMinutes = "Extension must be between 1 and 1440 minutes.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        referenceId: referenceId.trim().toUpperCase(),
        name: name.trim(),
        origin: origin.trim() || undefined,
        destination: destination.trim() || undefined,
        pickupServiceAt: new Date(pickupServiceAt).toISOString(),
        startAt: new Date(startAt).toISOString(),
        initialCloseAt: new Date(initialCloseAt).toISOString(),
        forcedCloseAt: new Date(forcedCloseAt).toISOString(),
        triggerWindowMinutes: parseInt(triggerWindowMinutes, 10),
        extensionMinutes: parseInt(extensionMinutes, 10),
        extensionTriggers,
      };

      const res = await api.createAuction(payload);
      router.push(`/auctions/${res.data.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setGeneralError("Admin session expired. Please re-authenticate.");
          setIsAdmin(false);
        } else if (err.details && typeof err.details === "object") {
          // If Zod field errors came back
          const details = err.details as { fieldErrors?: Record<string, string[]> };
          if (details.fieldErrors) {
            const mapped: Record<string, string> = {};
            for (const [key, msgs] of Object.entries(details.fieldErrors)) {
              if (Array.isArray(msgs) && msgs.length > 0) {
                mapped[key] = msgs[0];
              }
            }
            setFieldErrors(mapped);
          }
          setGeneralError(err.message || "Failed to create auction. Please check input errors.");
        } else {
          setGeneralError(err.message);
        }
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError("An unexpected error occurred while creating the auction.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex flex-col bg-[#090a0c] text-[#ededed]">
        <Header />
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-16 flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-[#9ea2b0] font-mono">
            <Loader2 className="w-4 h-4 animate-spin text-[#dc2626]" />
            <span>Verifying admin privileges...</span>
          </div>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col bg-[#090a0c] text-[#ededed]">
        <Header />
        <main className="flex-1 max-w-md w-full mx-auto px-4 py-16 flex flex-col items-center justify-center">
          <div className="w-full p-6 rounded border border-[#2b2e3e] bg-[#101217] text-center space-y-4">
            <div className="w-10 h-10 rounded-full bg-[#2a1317] border border-[#dc2626]/30 flex items-center justify-center mx-auto text-[#ef4444]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#ededed]">
                Admin Authentication Required
              </h2>
              <p className="mt-1 text-xs text-[#8d92a4]">
                Only authenticated procurement administrators can create and publish RFQ auctions.
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href="/login"
                className="w-full py-2 px-4 rounded text-xs font-semibold bg-[#dc2626] hover:bg-[#ef4444] text-white transition-colors"
              >
                Log in as Administrator
              </Link>
              <Link
                href="/"
                className="w-full py-2 px-4 rounded text-xs text-[#9ea2b0] hover:text-[#ededed] bg-[#161821] border border-[#282b3a] transition-colors"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#090a0c] text-[#ededed]">
      <Header />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[#9ea2b0] hover:text-[#ededed] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Page Title */}
        <div className="border-b border-[#1f222b] pb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#ededed]">
              Create Freight RFQ Auction
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1f1315] border border-[#dc2626]/40 text-[#f87171]">
              ADMIN OPERATION
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-[#9ea2b0]">
            Configure freight routing, bidding schedule, and anti-sniping extension rules.
          </p>
        </div>

        {/* General Error Banner */}
        {generalError && (
          <div className="p-4 rounded border border-[#dc2626]/40 bg-[#251216] text-[#fca5a5] flex items-start gap-3 text-xs">
            <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#f87171]">Auction Creation Failed</p>
              <p className="mt-0.5">{generalError}</p>
            </div>
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* SECTION 1: Procurement & Route Metadata */}
          <div className="rounded border border-[#1f222b] bg-[#101217] p-5 sm:p-6 space-y-4">
            <div className="border-b border-[#1f222b] pb-3">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#ededed] flex items-center gap-2">
                <span>01. RFQ Identification & Logistics</span>
              </h2>
              <p className="text-[11px] text-[#8d92a4] mt-0.5">
                Core procurement identification and delivery corridor.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="rfq-ref"
                  className="block text-xs font-mono uppercase text-[#c5c8d4] mb-1"
                >
                  Reference ID <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  id="rfq-ref"
                  type="text"
                  required
                  placeholder="e.g. RFQ-2026-DEL-BOM-001"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  className={`w-full px-3 py-2 text-xs font-mono bg-[#151720] border rounded text-[#ededed] placeholder-[#646877] focus:outline-none transition-colors ${
                    fieldErrors.referenceId
                      ? "border-[#ef4444] focus:border-[#ef4444]"
                      : "border-[#282b3a] focus:border-[#dc2626]"
                  }`}
                />
                {fieldErrors.referenceId && (
                  <p className="mt-1 text-[11px] text-[#f87171]">
                    {fieldErrors.referenceId}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="rfq-name"
                  className="block text-xs font-mono uppercase text-[#c5c8d4] mb-1"
                >
                  RFQ Name / Description <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  id="rfq-name"
                  type="text"
                  required
                  placeholder="e.g. 40ft Container Freight Delhi to Mumbai"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-[#151720] border rounded text-[#ededed] placeholder-[#646877] focus:outline-none transition-colors ${
                    fieldErrors.name
                      ? "border-[#ef4444] focus:border-[#ef4444]"
                      : "border-[#282b3a] focus:border-[#dc2626]"
                  }`}
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-[11px] text-[#f87171]">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label
                  htmlFor="rfq-origin"
                  className="block text-xs font-mono uppercase text-[#c5c8d4] mb-1"
                >
                  Origin Location
                </label>
                <input
                  id="rfq-origin"
                  type="text"
                  placeholder="e.g. Delhi (DEL)"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#151720] border border-[#282b3a] rounded text-[#ededed] placeholder-[#646877] focus:outline-none focus:border-[#dc2626]"
                />
              </div>

              <div>
                <label
                  htmlFor="rfq-dest"
                  className="block text-xs font-mono uppercase text-[#c5c8d4] mb-1"
                >
                  Destination Location
                </label>
                <input
                  id="rfq-dest"
                  type="text"
                  placeholder="e.g. Mumbai (BOM)"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#151720] border border-[#282b3a] rounded text-[#ededed] placeholder-[#646877] focus:outline-none focus:border-[#dc2626]"
                />
              </div>

              <div>
                <label
                  htmlFor="rfq-pickup"
                  className="block text-xs font-mono uppercase text-[#c5c8d4] mb-1"
                >
                  Pickup / Service Date <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  id="rfq-pickup"
                  type="datetime-local"
                  required
                  value={pickupServiceAt}
                  onChange={(e) => setPickupServiceAt(e.target.value)}
                  className={`w-full px-3 py-2 text-xs font-mono bg-[#151720] border rounded text-[#ededed] focus:outline-none transition-colors ${
                    fieldErrors.pickupServiceAt
                      ? "border-[#ef4444]"
                      : "border-[#282b3a] focus:border-[#dc2626]"
                  }`}
                />
                {fieldErrors.pickupServiceAt && (
                  <p className="mt-1 text-[11px] text-[#f87171]">
                    {fieldErrors.pickupServiceAt}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2: Bidding Timeline & Deadlines */}
          <div className="rounded border border-[#1f222b] bg-[#101217] p-5 sm:p-6 space-y-4">
            <div className="border-b border-[#1f222b] pb-3">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#ededed] flex items-center gap-2">
                <span>02. Schedule & Forced Close Cap</span>
              </h2>
              <p className="text-[11px] text-[#8d92a4] mt-0.5">
                British auction schedule. The forced close cap provides a guaranteed stopping point regardless of bidding activity.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="rfq-start"
                  className="block text-xs font-mono uppercase text-[#c5c8d4] mb-1"
                >
                  Auction Start <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  id="rfq-start"
                  type="datetime-local"
                  required
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className={`w-full px-3 py-2 text-xs font-mono bg-[#151720] border rounded text-[#ededed] focus:outline-none transition-colors ${
                    fieldErrors.startAt
                      ? "border-[#ef4444]"
                      : "border-[#282b3a] focus:border-[#dc2626]"
                  }`}
                />
                {fieldErrors.startAt && (
                  <p className="mt-1 text-[11px] text-[#f87171]">
                    {fieldErrors.startAt}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="rfq-close"
                  className="block text-xs font-mono uppercase text-[#c5c8d4] mb-1"
                >
                  Initial Close Time <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  id="rfq-close"
                  type="datetime-local"
                  required
                  value={initialCloseAt}
                  onChange={(e) => setInitialCloseAt(e.target.value)}
                  className={`w-full px-3 py-2 text-xs font-mono bg-[#151720] border rounded text-[#ededed] focus:outline-none transition-colors ${
                    fieldErrors.initialCloseAt
                      ? "border-[#ef4444]"
                      : "border-[#282b3a] focus:border-[#dc2626]"
                  }`}
                />
                {fieldErrors.initialCloseAt && (
                  <p className="mt-1 text-[11px] text-[#f87171]">
                    {fieldErrors.initialCloseAt}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="rfq-forced"
                  className="block text-xs font-mono uppercase text-[#c5c8d4] mb-1"
                >
                  Forced Close Cap <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  id="rfq-forced"
                  type="datetime-local"
                  required
                  value={forcedCloseAt}
                  onChange={(e) => setForcedCloseAt(e.target.value)}
                  className={`w-full px-3 py-2 text-xs font-mono bg-[#151720] border rounded text-[#ededed] focus:outline-none transition-colors ${
                    fieldErrors.forcedCloseAt
                      ? "border-[#ef4444]"
                      : "border-[#282b3a] focus:border-[#dc2626]"
                  }`}
                />
                {fieldErrors.forcedCloseAt && (
                  <p className="mt-1 text-[11px] text-[#f87171]">
                    {fieldErrors.forcedCloseAt}
                  </p>
                )}
              </div>
            </div>

            {/* Explanatory note for forced close */}
            <div className="p-3 rounded bg-[#151821] border border-[#232736] text-[11px] text-[#9ea2b0] flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-[#818cf8] shrink-0 mt-0.5" />
              <div>
                <strong className="text-[#ededed]">Forced Close Rule:</strong> The forced close time is an absolute hard ceiling. Even if qualifying bids or rank reversals arrive in the final minutes, the auction cannot extend beyond this timestamp.
              </div>
            </div>
          </div>

          {/* SECTION 3: British Extension Rules & Triggers */}
          <div className="rounded border border-[#1f222b] bg-[#101217] p-5 sm:p-6 space-y-4">
            <div className="border-b border-[#1f222b] pb-3">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#ededed] flex items-center gap-2">
                <span>03. Dynamic Extension Rules</span>
              </h2>
              <p className="text-[11px] text-[#8d92a4] mt-0.5">
                Prevent predatory auction sniping by extending the deadline when competitive activity happens near close.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="rfq-window"
                  className="block text-xs font-mono uppercase text-[#c5c8d4] mb-1"
                >
                  Trigger Window X (Minutes) <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  id="rfq-window"
                  type="number"
                  min="1"
                  max="1440"
                  required
                  value={triggerWindowMinutes}
                  onChange={(e) => setTriggerWindowMinutes(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#151720] border border-[#282b3a] rounded text-[#ededed] focus:outline-none focus:border-[#dc2626]"
                />
                <span className="text-[10px] text-[#646877] mt-1 block">
                  Action within the last X minutes triggers an extension.
                </span>
                {fieldErrors.triggerWindowMinutes && (
                  <p className="mt-1 text-[11px] text-[#f87171]">
                    {fieldErrors.triggerWindowMinutes}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="rfq-duration"
                  className="block text-xs font-mono uppercase text-[#c5c8d4] mb-1"
                >
                  Extension Duration Y (Minutes) <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  id="rfq-duration"
                  type="number"
                  min="1"
                  max="1440"
                  required
                  value={extensionMinutes}
                  onChange={(e) => setExtensionMinutes(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#151720] border border-[#282b3a] rounded text-[#ededed] focus:outline-none focus:border-[#dc2626]"
                />
                <span className="text-[10px] text-[#646877] mt-1 block">
                  Amount of time added to current deadline on trigger.
                </span>
                {fieldErrors.extensionMinutes && (
                  <p className="mt-1 text-[11px] text-[#f87171]">
                    {fieldErrors.extensionMinutes}
                  </p>
                )}
              </div>
            </div>

            {/* Checkboxes for triggers */}
            <div className="pt-2">
              <span className="block text-xs font-mono uppercase text-[#c5c8d4] mb-2">
                Enabled Extension Triggers
              </span>
              <div className="space-y-2.5">
                {[
                  {
                    id: "BID_RECEIVED" as ExtensionTriggerType,
                    label: "Bid received within X minutes of deadline",
                    desc: "Any valid supplier quote submitted inside the trigger window extends the deadline by Y minutes.",
                  },
                  {
                    id: "ANY_RANK_CHANGE" as ExtensionTriggerType,
                    label: "Any supplier ranking changes within X minutes",
                    desc: "Extends when any supplier's rank shifts up or down due to a new quote.",
                  },
                  {
                    id: "L1_RANK_CHANGE" as ExtensionTriggerType,
                    label: "L1 supplier changes within X minutes",
                    desc: "Extends when a new supplier takes the lowest total quote (L1 position).",
                  },
                ].map((trigger) => {
                  const checked = extensionTriggers.includes(trigger.id);
                  return (
                    <label
                      key={trigger.id}
                      className={`flex items-start gap-3 p-3 rounded border transition-colors cursor-pointer ${
                        checked
                          ? "bg-[#141620] border-[#363a4d]"
                          : "bg-[#0f1015] border-[#1f222b] hover:border-[#2b2e3d]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleTriggerToggle(trigger.id)}
                        className="mt-0.5 rounded border-[#363a4d] text-[#dc2626] focus:ring-0 focus:ring-offset-0 bg-[#1c1f2b] cursor-pointer"
                      />
                      <div className="text-xs">
                        <span className="font-medium text-[#ededed] block">
                          {trigger.label}
                        </span>
                        <span className="text-[11px] text-[#8d92a4] mt-0.5 block">
                          {trigger.desc}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1f222b]">
            <Link
              href="/"
              className="px-4 py-2 rounded text-xs font-medium text-[#9ea2b0] hover:text-[#ededed] bg-[#14161d] hover:bg-[#1a1d26] border border-[#262936] transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded text-xs font-semibold bg-[#dc2626] hover:bg-[#ef4444] text-white flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Publishing RFQ...</span>
                </>
              ) : (
                <span>Publish British Auction RFQ</span>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

