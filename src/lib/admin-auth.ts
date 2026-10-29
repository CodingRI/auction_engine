
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

function cleanEnvString(val: string | undefined): string {
  if (!val) return "";
  let clean = val.trim();
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1).trim();
  }
  return clean;
}

export async function verifyAdminCredentials(
  email: string,
  password: string,
): Promise<boolean> {
  const configuredEmail = cleanEnvString(process.env.ADMIN_EMAIL);
  const configuredHash = cleanEnvString(process.env.ADMIN_PASSWORD_HASH);
  const configuredPlainPassword = cleanEnvString(
    process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSOWORD,
  );

  if (!configuredEmail || (!configuredHash && !configuredPlainPassword)) {
    throw new Error("Admin credentials are not configured");
  }

  const emailMatches = safeEqual(
    email.trim().toLowerCase(),
    configuredEmail.toLowerCase(),
  );

  if (!emailMatches) {
    return false;
  }

  // 1. Direct match with plain password if configured in env
  if (configuredPlainPassword && safeEqual(password, configuredPlainPassword)) {
    return true;
  }

  if (!configuredHash) {
    return false;
  }

  const cleanHash = configuredHash;

  // 2. Direct match in case the hash itself was entered or configured
  if (safeEqual(password, cleanHash) || safeEqual(password.trim(), cleanHash)) {
    return true;
  }

  // 3. Argon2 hash format ($argon2id$, $argon2i$, etc.)
  if (cleanHash.startsWith("$")) {
    try {
      return await argon2.verify(cleanHash, password);
    } catch (err) {
      console.error("Argon2 verification failed:", err);
      return false;
    }
  }

  // 4. SHA-256 hexadecimal hash (64 hex characters)
  if (/^[a-f0-9]{64}$/i.test(cleanHash)) {
    const inputHash = createHash("sha256").update(password).digest("hex");
    const inputHashTrimmed = createHash("sha256").update(password.trim()).digest("hex");

    return (
      safeEqual(inputHash.toLowerCase(), cleanHash.toLowerCase()) ||
      safeEqual(inputHashTrimmed.toLowerCase(), cleanHash.toLowerCase())
    );
  }

  // 5. Fallback: try argon2 first, then safe plaintext comparison
  try {
    return await argon2.verify(cleanHash, password);
  } catch {
    return safeEqual(password, cleanHash) || safeEqual(password.trim(), cleanHash);
  }
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
  try {
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
  } catch {
    return false;
  }
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
