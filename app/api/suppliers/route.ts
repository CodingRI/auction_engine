import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";



export async function GET() {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
      orderBy: { code: "asc" },
    });

    return NextResponse.json({ data: suppliers });
  } catch (error) {
    console.error("Failed to fetch suppliers:", error);
    return NextResponse.json(
      { error: "Unable to fetch suppliers" },
      { status: 500 },
    );
  }
}
