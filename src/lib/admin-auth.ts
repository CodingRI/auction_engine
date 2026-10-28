
import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import argon2 from "argon2";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "auction_admin_session";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return (
    aBuffer.length === bBuffer.length &&
    timingSafeEqual(aBuffer, bBuffer)
  );
}

export async function verifyAdminCredentials(
  email: string,
  password: string,
): Promise<boolean> {
  const configuredEmail = process.env.ADMIN_EMAIL;
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;

  if (!configuredEmail || !configuredHash) {
    throw new Error("Admin credentials are not configured");
  }

  const emailMatches = safeEqual(
    email.trim().toLowerCase(),
    configuredEmail.trim().toLowerCase(),
  );

  const passwordMatches = await argon2.verify(
    configuredHash,
    password,
  );

  return emailMatches && passwordMatches;
}

export async function createAdminSession(): Promise<string> {
  const token = randomBytes(32).toString("hex");

  await prisma.adminSession.create({
    data: {
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    },
  });

  return token;
}

export async function setAdminSessionCookie(
  token: string,
): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return false;
  }

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true },
  });

  return Boolean(session && session.expiresAt > new Date());
}

export async function revokeAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await prisma.adminSession.deleteMany({
      where: { tokenHash: hashToken(token) },
    });
  }

  cookieStore.delete(COOKIE_NAME);
}
