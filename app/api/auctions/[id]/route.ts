
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateRankings } from "@/modules/auction.engine";



type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  try {
    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        bids: {
          include: {
            supplier: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: [
            { totalAmount: "asc" },
            { submittedAt: "asc" },
          ],
        },
        events: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!auction) {
      return NextResponse.json(
        { error: "Auction not found" },
        { status: 404 },
      );
    }

    const snapshots = auction.bids.map((bid) => ({
      supplierId: bid.supplierId,
      totalCents: Math.round(Number(bid.totalAmount) * 100),
      submittedAt: bid.submittedAt,
    }));

    const rankingBySupplier = new Map(
      calculateRankings(snapshots).map((ranked) => [
        ranked.supplierId,
        ranked.rank,
      ]),
    );

    return NextResponse.json({
      data: {
        id: auction.id,
        referenceId: auction.referenceId,
        name: auction.name,
        origin: auction.origin,
        destination: auction.destination,
        pickupServiceAt: auction.pickupServiceAt,
        startAt: auction.startAt,
        initialCloseAt: auction.initialCloseAt,
        currentCloseAt: auction.currentCloseAt,
        forcedCloseAt: auction.forcedCloseAt,
        triggerWindowMinutes: auction.triggerWindowMinutes,
        extensionMinutes: auction.extensionMinutes,
        extensionTriggers: auction.extensionTriggers,
        status: auction.status,
        bids: auction.bids.map((bid) => ({
          id: bid.id,
          supplier: bid.supplier,
          freightCharge: bid.freightCharge.toString(),
          originCharge: bid.originCharge.toString(),
          destinationCharge: bid.destinationCharge.toString(),
          totalAmount: bid.totalAmount.toString(),
          transitTimeHours: bid.transitTimeHours,
          validUntil: bid.validUntil,
          submittedAt: bid.submittedAt,
          rank: rankingBySupplier.get(bid.supplierId) ?? null,
        })),
        events: auction.events,
      },
    });
  } catch (error) {
    console.error("Failed to fetch auction details:", error);

    return NextResponse.json(
      { error: "Unable to fetch auction details" },
      { status: 500 },
    );
  }
}
