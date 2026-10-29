import React, { Suspense, use } from "react";
import AuctionDetailView from "./AuctionDetailView";
import { Loader2 } from "lucide-react";

export const instant = false;

function AuctionDetailAsync({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AuctionDetailView id={id} />;
}

export default function AuctionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col bg-[#090a0c] text-[#ededed]">
          <header className="w-full border-b border-[#232630] bg-[#0c0d10] h-14" />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-16 flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs font-mono text-[#9ea2b0]">
              <Loader2 className="w-4 h-4 animate-spin text-[#dc2626]" />
              <span>Loading auction parameters...</span>
            </div>
          </main>
        </div>
      }
    >
      <AuctionDetailAsync params={params} />
    </Suspense>
  );
}
