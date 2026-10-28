
import "server-only";

import { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "../lib/prisma";
import {
  calculateRankings,
  decideExtension,
  type BidSnapshot,
  type ExtensionTrigger,
} from "./auction.engine";
import {
  AuctionNotFoundError,
  AuctionNotOpenError,
  InvalidBidError,
} from "./auction.errors";


export interface SubmitBidInput {
  auctionId: string;
  supplierId: string;
  freightCharge: number;
  originCharge: number;
  destinationCharge: number;
  transitTimeHours: number;
  validUntil: Date;
}

function toCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidBidError("Charges must be valid non-negative amounts");
  }

  const cents = Math.round(value * 100);

  if (!Number.isSafeInteger(cents)) {
    throw new InvalidBidError("Charge is too large");
  }

  return cents;
}

function toBidSnapshot(bid: {
  supplierId: string;
  totalAmount: Prisma.Decimal;
  submittedAt: Date;
}): BidSnapshot {
  return {
    supplierId: bid.supplierId,
    totalCents: Math.round(Number(bid.totalAmount) * 100),
    submittedAt: bid.submittedAt,
  };
}

export async function submitBid(input: SubmitBidInput) {
  const freightCents = toCents(input.freightCharge);
  const originCents = toCents(input.originCharge);
  const destinationCents = toCents(input.destinationCharge);
  const totalCents = freightCents + originCents + destinationCents;

  if (!Number.isSafeInteger(totalCents)) {
    throw new InvalidBidError("Total bid amount is too large");
  }

  if (
    !Number.isInteger(input.transitTimeHours) ||
    input.transitTimeHours <= 0
  ) {
    throw new InvalidBidError("Transit time must be a positive integer");
  }

  if (
    !(input.validUntil instanceof Date) ||
    Number.isNaN(input.validUntil.getTime())
  ) {
    throw new InvalidBidError("Quote validity date is invalid");
  }

  return prisma.$transaction(
    async (tx) => {
      // Serialize bid submissions for this auction. This prevents two
      // concurrent requests from calculating extensions from stale state.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Auction"
        WHERE "id" = ${input.auctionId}
        FOR UPDATE
      `;

      if (locked.length === 0) {
        throw new AuctionNotFoundError();
      }

      const auction = await tx.auction.findUnique({
        where: { id: input.auctionId },
        include: { bids: true },
      });

      if (!auction) {
        throw new AuctionNotFoundError();
      }

      const now = new Date();

      if (now < auction.startAt) {
        throw new AuctionNotOpenError("Auction has not started yet");
      }

      if (
        now >= auction.currentCloseAt ||
        now >= auction.forcedCloseAt ||
        auction.status === "CLOSED" ||
        auction.status === "FORCE_CLOSED"
      ) {
        const forceClosed = now >= auction.forcedCloseAt;

        await tx.auction.update({
          where: { id: auction.id },
          data: {
            status: forceClosed ? "FORCE_CLOSED" : "CLOSED",
          },
        });

        await tx.auctionEvent.create({
          data: {
            auctionId: auction.id,
            type: forceClosed ? "AUCTION_FORCE_CLOSED" : "AUCTION_CLOSED",
            reason: forceClosed
              ? "Forced close time reached"
              : "Current bid deadline reached",
          },
        });

        throw new AuctionNotOpenError();
      }

      const supplier = await tx.supplier.findUnique({
        where: { id: input.supplierId },
      });

      if (!supplier || !supplier.isActive) {
        throw new InvalidBidError("Supplier does not exist or is inactive");
      }

      const candidateSnapshot: BidSnapshot = {
        supplierId: input.supplierId,
        totalCents,
        submittedAt: now,
      };

      const existingSnapshots = auction.bids.map(toBidSnapshot);

      const decision = decideExtension({
        currentCloseAt: auction.currentCloseAt,
        forcedCloseAt: auction.forcedCloseAt,
        now,
        triggerWindowMinutes: auction.triggerWindowMinutes,
        extensionMinutes: auction.extensionMinutes,
        enabledTriggers: auction.extensionTriggers as ExtensionTrigger[],
        existingBids: existingSnapshots,
        candidateBid: candidateSnapshot,
      });

      const bid = await tx.bid.create({
        data: {
          auctionId: auction.id,
          supplierId: input.supplierId,
          freightCharge: new Prisma.Decimal(freightCents).div(100),
          originCharge: new Prisma.Decimal(originCents).div(100),
          destinationCharge: new Prisma.Decimal(destinationCents).div(100),
          totalAmount: new Prisma.Decimal(totalCents).div(100),
          transitTimeHours: input.transitTimeHours,
          validUntil: input.validUntil,
          submittedAt: now,
        },
      });

      await tx.auctionEvent.create({
        data: {
          auctionId: auction.id,
          bidId: bid.id,
          type: "BID_SUBMITTED",
          reason: `Bid submitted by ${supplier.code}`,
        },
      });

      const updatedAuction = await tx.auction.update({
        where: { id: auction.id },
        data: {
          status: "ACTIVE",
          ...(decision.shouldExtend
            ? { currentCloseAt: decision.newCloseAt }
            : {}),
        },
      });

      if (decision.shouldExtend) {
        await tx.auctionEvent.create({
          data: {
            auctionId: auction.id,
            bidId: bid.id,
            type: "AUCTION_EXTENDED",
            reason: decision.reasons.join(", "),
            previousCloseAt: decision.previousCloseAt,
            newCloseAt: decision.newCloseAt,
          },
        });
      }

      const allBids = [
        ...existingSnapshots,
        candidateSnapshot,
      ];

      return {
        bid: {
          id: bid.id,
          totalAmount: bid.totalAmount.toString(),
          submittedAt: bid.submittedAt,
        },
        auction: {
          id: updatedAuction.id,
          referenceId: updatedAuction.referenceId,
          status: updatedAuction.status,
          currentCloseAt: updatedAuction.currentCloseAt,
          forcedCloseAt: updatedAuction.forcedCloseAt,
        },
        rankings: calculateRankings(allBids),
        extension: {
          extended: decision.shouldExtend,
          reasons: decision.reasons,
          previousCloseAt: decision.previousCloseAt,
          newCloseAt: decision.newCloseAt,
        },
      };
    },
    {
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}
