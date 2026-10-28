
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const supplierData = [
    { code: "SUP-A", name: "Eastern Freight Logistics" },
    { code: "SUP-B", name: "Bengal Transport Co." },
    { code: "SUP-C", name: "Rapid Cargo Services" },
  ];

  const suppliers = await Promise.all(
    supplierData.map((supplier) =>
      prisma.supplier.upsert({
        where: { code: supplier.code },
        update: { name: supplier.name, isActive: true },
        create: supplier,
      }),
    ),
  );

  const now = new Date();
  const startAt = new Date(now.getTime() - 30 * 60_000);
  const initialCloseAt = new Date(now.getTime() + 30 * 60_000);
  const forcedCloseAt = new Date(now.getTime() + 60 * 60_000);

  const activeAuction = await prisma.auction.upsert({
    where: { referenceId: "RFQ-DEMO-001" },
    update: {},
    create: {
      referenceId: "RFQ-DEMO-001",
      name: "Kolkata to Bengaluru Freight",
      origin: "Kolkata",
      destination: "Bengaluru",
      pickupServiceAt: new Date(
        now.getTime() + 7 * 24 * 60 * 60_000,
      ),
      startAt,
      initialCloseAt,
      currentCloseAt: initialCloseAt,
      forcedCloseAt,
      triggerWindowMinutes: 10,
      extensionMinutes: 5,
      extensionTriggers: [
        "BID_RECEIVED",
        "ANY_RANK_CHANGE",
        "L1_RANK_CHANGE",
      ],
      status: "ACTIVE",
    },
  });

  const scheduledStartAt = new Date(now.getTime() + 2 * 60 * 60_000);
  const scheduledCloseAt = new Date(now.getTime() + 3 * 60 * 60_000);
  const scheduledForcedCloseAt = new Date(
    now.getTime() + 3.5 * 60 * 60_000,
  );

  await prisma.auction.upsert({
    where: { referenceId: "RFQ-DEMO-002" },
    update: {},
    create: {
      referenceId: "RFQ-DEMO-002",
      name: "Mumbai to Delhi Freight",
      origin: "Mumbai",
      destination: "Delhi",
      pickupServiceAt: new Date(
        now.getTime() + 10 * 24 * 60 * 60_000,
      ),
      startAt: scheduledStartAt,
      initialCloseAt: scheduledCloseAt,
      currentCloseAt: scheduledCloseAt,
      forcedCloseAt: scheduledForcedCloseAt,
      triggerWindowMinutes: 10,
      extensionMinutes: 5,
      extensionTriggers: ["BID_RECEIVED"],
      status: "SCHEDULED",
    },
  });

  const existingBidCount = await prisma.bid.count({
    where: { auctionId: activeAuction.id },
  });

  if (existingBidCount === 0) {
    const bidInputs = [
      {
        supplier: suppliers[0],
        freightCharge: "50000.00",
        originCharge: "2500.00",
        destinationCharge: "3500.00",
        transitTimeHours: 48,
      },
      {
        supplier: suppliers[1],
        freightCharge: "48000.00",
        originCharge: "2000.00",
        destinationCharge: "3000.00",
        transitTimeHours: 52,
      },
      {
        supplier: suppliers[2],
        freightCharge: "46000.00",
        originCharge: "2500.00",
        destinationCharge: "2500.00",
        transitTimeHours: 44,
      },
    ];

    for (const [index, input] of bidInputs.entries()) {
      const submittedAt = new Date(
        now.getTime() - (20 - index * 5) * 60_000,
      );

      const bid = await prisma.bid.create({
        data: {
          auctionId: activeAuction.id,
          supplierId: input.supplier.id,
          freightCharge: input.freightCharge,
          originCharge: input.originCharge,
          destinationCharge: input.destinationCharge,
          totalAmount: (
            Number(input.freightCharge) +
            Number(input.originCharge) +
            Number(input.destinationCharge)
          ).toFixed(2),
          transitTimeHours: input.transitTimeHours,
          validUntil: new Date(
            now.getTime() + 7 * 24 * 60 * 60_000,
          ),
          submittedAt,
        },
      });

      await prisma.auctionEvent.create({
        data: {
          auctionId: activeAuction.id,
          bidId: bid.id,
          type: "BID_SUBMITTED",
          reason: "Initial demo quote",
          createdAt: submittedAt,
        },
      });
    }
  }

  const [supplierCount, auctionCount, bidCount, eventCount] =
    await Promise.all([
      prisma.supplier.count(),
      prisma.auction.count(),
      prisma.bid.count({ where: { auctionId: activeAuction.id } }),
      prisma.auctionEvent.count({
        where: { auctionId: activeAuction.id },
      }),
    ]);

  console.log("Seed verification:", {
    supplierCount,
    auctionCount,
    activeAuctionId: activeAuction.id,
    activeAuctionReference: activeAuction.referenceId,
    activeAuctionBidCount: bidCount,
    activeAuctionEventCount: eventCount,
  });

  if (
    supplierCount < 3 ||
    auctionCount < 2 ||
    bidCount < 3 ||
    eventCount < 3
  ) {
    throw new Error("Seed verification failed");
  }
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
