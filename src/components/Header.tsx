"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, LogIn, LogOut, ShieldCheck, Box } from "lucide-react";

export const Header: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const res = await api.getAuthSession();
      setIsAdmin(res.authenticated);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth, pathname]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await api.logout();
      setIsAdmin(false);
      router.refresh();
      if (pathname === "/auctions/new") {
        router.push("/login");
      }
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#232630] bg-[#0c0d10]/95 backdrop-blur-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-[#ededed] hover:text-white transition-colors group"
          >
            <div className="w-7 h-7 rounded bg-[#181920] border border-[#2e323e] flex items-center justify-center text-[#dc2626] group-hover:border-[#dc2626]/50 transition-colors">
              <Box className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-xs tracking-wider uppercase font-semibold text-[#ededed]">
                BRITISH RFQ ENGINE
              </span>
              <span className="text-[10px] text-[#646877] tracking-tight uppercase">
                Freight Procurement Ops
              </span>
            </div>
          </Link>

          {/* Navigation links */}
          <nav className="hidden sm:flex items-center gap-1 border-l border-[#232630] pl-6 h-6">
            <Link
              href="/"
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                pathname === "/"
                  ? "bg-[#181a22] text-[#ededed] font-medium border border-[#2b2e3c]"
                  : "text-[#9ea2b0] hover:text-[#ededed] hover:bg-[#14151c]"
              }`}
            >
              Auctions
            </Link>
          </nav>
        </div>

        {/* Right action area */}
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/auctions/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#dc2626] hover:bg-[#ef4444] text-white transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Create RFQ</span>
            </Link>
          )}

          {isAdmin === null ? (
            <div className="w-16 h-7 rounded bg-[#161820] animate-pulse" />
          ) : isAdmin ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded bg-[#141d1a] border border-[#10b981]/30 text-[#34d399]">
                <ShieldCheck className="w-3 h-3 text-[#10b981]" />
                ADMIN
              </span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                aria-label="Log out of admin session"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs text-[#9ea2b0] hover:text-[#ededed] hover:bg-[#181a22] border border-transparent hover:border-[#2b2e3c] transition-colors disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-[#ededed] bg-[#161821] hover:bg-[#1e202b] border border-[#2b2e3c] hover:border-[#3d4254] transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 text-[#9ea2b0]" />
              <span>Admin Login</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

