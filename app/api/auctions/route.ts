
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createAuctionSchema } from "@/modules/auction.schema"


export async function GET() {
  try {
    const auctions = await prisma.auction.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        bids: {
          orderBy: { totalAmount: "asc" },
          take: 1,
          select: {
            totalAmount: true,
          },
        },
      },
    });

    const data = auctions.map((auction) => ({
      id: auction.id,
      referenceId: auction.referenceId,
      name: auction.name,
      origin: auction.origin,
      destination: auction.destination,
      startAt: auction.startAt,
      initialCloseAt: auction.initialCloseAt,
      currentCloseAt: auction.currentCloseAt,
      forcedCloseAt: auction.forcedCloseAt,
      status: auction.status,
      lowestBid: auction.bids[0]?.totalAmount.toString() ?? null,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Failed to fetch auctions:", error);

    return NextResponse.json(
      { error: "Unable to fetch auctions" },
      { status: 500 },
    );
  }
}



export async function POST(request: Request) {
  try {
    const authenticated = await isAdminAuthenticated();

    if (!authenticated) {
      return NextResponse.json(
        { error: "Admin authentication required" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createAuctionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid auction configuration",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const now = new Date();

    const auction = await prisma.auction.create({
      data: {
        referenceId: input.referenceId,
        name: input.name,
        origin: input.origin,
        destination: input.destination,
        pickupServiceAt: input.pickupServiceAt,
        startAt: input.startAt,
        initialCloseAt: input.initialCloseAt,
        currentCloseAt: input.initialCloseAt,
        forcedCloseAt: input.forcedCloseAt,
        triggerWindowMinutes: input.triggerWindowMinutes,
        extensionMinutes: input.extensionMinutes,
        extensionTriggers: input.extensionTriggers,
        status: input.startAt <= now ? "ACTIVE" : "SCHEDULED",
      },
    });

    return NextResponse.json(
      {
        data: {
          id: auction.id,
          referenceId: auction.referenceId,
          name: auction.name,
          status: auction.status,
          currentCloseAt: auction.currentCloseAt,
          forcedCloseAt: auction.forcedCloseAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "An auction with this reference ID already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create auction:", error);

    return NextResponse.json(
      { error: "Unable to create auction" },
      { status: 500 },
    );
  }
}
