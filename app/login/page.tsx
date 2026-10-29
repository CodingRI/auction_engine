"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Shield, ArrowLeft, Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    // Client-side quick checks
    if (!email.trim()) {
      setErrorMessage("Email address is required.");
      return;
    }
    if (!password) {
      setErrorMessage("Password is required.");
      return;
    }

    setSubmitting(true);

    try {
      await api.login({ email, password });
      // On success, redirect to dashboard
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || "Invalid credentials. Please verify your email and password.");
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("An unexpected authentication error occurred.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#090a0c] text-[#ededed] px-4 py-12">
      <div className="w-full max-w-md">
        {/* Back navigation */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[#9ea2b0] hover:text-[#ededed] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Auctions</span>
          </Link>
        </div>

        {/* Login box */}
        <div className="rounded border border-[#1f222b] bg-[#101217] p-6 sm:p-8 shadow-xl">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[#1f222b] pb-5 mb-6">
            <div className="w-9 h-9 rounded bg-[#181a24] border border-[#2d3142] flex items-center justify-center text-[#dc2626]">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-[#ededed] tracking-tight">
                Admin Authentication
              </h1>
              <p className="text-xs text-[#8d92a4]">
                British Auction Freight Procurement Engine
              </p>
            </div>
          </div>

          {/* Error alert */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-6 p-3 rounded border border-[#dc2626]/40 bg-[#251216] text-[#fca5a5] flex items-start gap-2.5 text-xs"
            >
              <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="admin-email"
                className="block text-xs font-medium text-[#c5c8d4] mb-1.5 uppercase font-mono tracking-wider"
              >
                Admin Email
              </label>
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@procurement.internal"
                disabled={submitting}
                className="w-full px-3 py-2 text-xs bg-[#151720] border border-[#282b3a] rounded text-[#ededed] placeholder-[#646877] focus:outline-none focus:border-[#dc2626] font-mono transition-colors disabled:opacity-50"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="admin-password"
                  className="block text-xs font-medium text-[#c5c8d4] uppercase font-mono tracking-wider"
                >
                  Password
                </label>
              </div>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 text-xs bg-[#151720] border border-[#282b3a] rounded text-[#ededed] placeholder-[#646877] focus:outline-none focus:border-[#dc2626] font-mono transition-colors disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 py-2.5 px-4 rounded text-xs font-semibold bg-[#dc2626] hover:bg-[#ef4444] text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Authenticate Session</span>
              )}
            </button>
          </form>

          {/* Security footnote */}
          <div className="mt-6 pt-4 border-t border-[#1a1d26] text-center">
            <p className="text-[11px] text-[#646877] font-mono">
              Secure HTTP-only session cookie will be established upon verification.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

