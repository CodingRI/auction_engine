
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createAdminSession,
  setAdminSessionCookie,
  verifyAdminCredentials,
} from "@/lib/admin-auth";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid login request" },
      { status: 400 },
    );
  }

  try {
    const valid = await verifyAdminCredentials(
      parsed.data.email,
      parsed.data.password,
    );

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const token = await createAdminSession();
    await setAdminSessionCookie(token);

    return NextResponse.json({ authenticated: true });
  } catch (error) {
    console.error("Admin login failed:", error);

    return NextResponse.json(
      { error: "Unable to log in" },
      { status: 500 },
    );
  }
}
