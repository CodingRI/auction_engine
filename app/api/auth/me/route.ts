import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";



export async function GET() {
  try {
    const authenticated = await isAdminAuthenticated();
    return NextResponse.json({ authenticated });
  } catch (error) {
    console.error("Failed to verify admin authentication session:", error);
    return NextResponse.json({ authenticated: false });
  }
}
