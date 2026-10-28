
import { NextResponse } from "next/server";
import { revokeAdminSession } from "@/lib/admin-auth";

export async function POST() {
  await revokeAdminSession();
  return NextResponse.json({ authenticated: false });
}
