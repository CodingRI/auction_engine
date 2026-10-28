
import { NextResponse } from "next/server";
import { z } from "zod";
import { submitBid } from "@/modules/auction.service";
import { AuctionError } from "@/modules/auction.errors";

const bidSchema = z.object({
  supplierId: z.string().min(1),
  freightCharge: z.number().finite().nonnegative(),
  originCharge: z.number().finite().nonnegative(),
  destinationCharge: z.number().finite().nonnegative(),
  transitTimeHours: z.number().int().positive(),
  validUntil: z.iso.datetime().transform((value) => new Date(value)),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = bidSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid bid",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await submitBid({
      auctionId: id,
      ...parsed.data,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AuctionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }

    console.error("Failed to submit bid:", error);

    return NextResponse.json(
      { error: "Unable to submit bid" },
      { status: 500 },
    );
  }
}
