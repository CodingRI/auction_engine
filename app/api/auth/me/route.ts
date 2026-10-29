import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";



export async function GET(_request: Request) {
  try {
    const authenticated = await isAdminAuthenticated();
    return NextResponse.json({ authenticated });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
