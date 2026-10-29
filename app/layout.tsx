import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "British Auction RFQ Engine | Freight Procurement",
  description: "Operational British auction platform for freight RFQ management, quote tracking, and automatic deadline extensions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col font-sans bg-[#0c0d0e] text-[#ededed]">
        {children}
      </body>
    </html>
  );
}
