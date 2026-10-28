-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'CLOSED', 'FORCE_CLOSED');

-- CreateEnum
CREATE TYPE "ExtensionTrigger" AS ENUM ('BID_RECEIVED', 'ANY_RANK_CHANGE', 'L1_RANK_CHANGE');

-- CreateEnum
CREATE TYPE "AuctionEventType" AS ENUM ('BID_SUBMITTED', 'AUCTION_EXTENDED', 'AUCTION_CLOSED', 'AUCTION_FORCE_CLOSED');

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" TEXT,
    "destination" TEXT,
    "pickupServiceAt" TIMESTAMP(3) NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "initialCloseAt" TIMESTAMP(3) NOT NULL,
    "currentCloseAt" TIMESTAMP(3) NOT NULL,
    "forcedCloseAt" TIMESTAMP(3) NOT NULL,
    "triggerWindowMinutes" INTEGER NOT NULL,
    "extensionMinutes" INTEGER NOT NULL,
    "extensionTriggers" "ExtensionTrigger"[] DEFAULT ARRAY[]::"ExtensionTrigger"[],
    "status" "AuctionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "freightCharge" DECIMAL(12,2) NOT NULL,
    "originCharge" DECIMAL(12,2) NOT NULL,
    "destinationCharge" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "transitTimeHours" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionEvent" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "bidId" TEXT,
    "type" "AuctionEventType" NOT NULL,
    "reason" TEXT,
    "previousCloseAt" TIMESTAMP(3),
    "newCloseAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auction_referenceId_key" ON "Auction"("referenceId");

-- CreateIndex
CREATE INDEX "Auction_status_currentCloseAt_idx" ON "Auction"("status", "currentCloseAt");

-- CreateIndex
CREATE INDEX "Auction_startAt_idx" ON "Auction"("startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE INDEX "Bid_auctionId_totalAmount_idx" ON "Bid"("auctionId", "totalAmount");

-- CreateIndex
CREATE INDEX "Bid_auctionId_supplierId_submittedAt_idx" ON "Bid"("auctionId", "supplierId", "submittedAt");

-- CreateIndex
CREATE INDEX "Bid_supplierId_idx" ON "Bid"("supplierId");

-- CreateIndex
CREATE INDEX "AuctionEvent_auctionId_createdAt_idx" ON "AuctionEvent"("auctionId", "createdAt");

-- CreateIndex
CREATE INDEX "AuctionEvent_bidId_idx" ON "AuctionEvent"("bidId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionEvent" ADD CONSTRAINT "AuctionEvent_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionEvent" ADD CONSTRAINT "AuctionEvent_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;
