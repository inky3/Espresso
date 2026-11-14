import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireFirebaseUser, RIN_PRIVATE_MESSAGE } from "@/lib/server/auth";
import { createRinSession, rinCookie } from "@/lib/server/rin-session";
import { FIREBASE_PROJECT_ID } from "@/lib/firebase-config";

/** After this many wrong PINs in a row, unlocking is blocked for LOCK_MINUTES. */
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function lockDocument(uid: string) {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}/rin/lock`;
}

async function readLock(uid: string, token: string) {
  try {
    const response = await fetch(lockDocument(uid), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { failures: 0, lockedUntil: 0 };
    const data = await response.json();
    return {
      failures: Number(data.fields?.failures?.integerValue) || 0,
      lockedUntil: Number(data.fields?.lockedUntil?.integerValue) || 0,
    };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}

async function writeLock(uid: string, token: string, failures: number, lockedUntil: number) {
  try {
    await fetch(`${lockDocument(uid)}?updateMask.fieldPaths=failures&updateMask.fieldPaths=lockedUntil`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { failures: { integerValue: String(failures) }, lockedUntil: { integerValue: String(lockedUntil) } } }),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
  } catch { /* best effort */ }
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  const verified = await requireFirebaseUser(req, { deniedMessage: RIN_PRIVATE_MESSAGE });
  if (verified.error) return verified.error;

  // Check server configuration before counting an attempt. Otherwise a missing
  // environment variable can consume the user's attempts and lock them out.
  const configuredPin = process.env.RIN_ACCESS_PIN;
  if (!configuredPin) {
    return NextResponse.json({ error: "Rin access is not configured on the server." }, { status: 503 });
  }
  if (!process.env.RIN_SESSION_SECRET || process.env.RIN_SESSION_SECRET.length < 32) {
    return NextResponse.json({ error: "Rin session security is not configured." }, { status: 503 });
  }

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const lock = await readLock(verified.user.uid, token);
  if (lock.lockedUntil > Date.now()) {
    const minutes = Math.ceil((lock.lockedUntil - Date.now()) / 60_000);
    return NextResponse.json({ error: `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` }, { status: 429 });
  }

  try {
    const body = await req.json();
    const pin = typeof body?.pin === "string" ? body.pin : "";
    const expected = Buffer.from(configuredPin);
    const supplied = Buffer.from(pin);
    const valid = expected.length === supplied.length && timingSafeEqual(expected, supplied);

    if (!valid) {
      const failures = lock.failures + 1;
      if (failures >= MAX_ATTEMPTS) {
        await writeLock(verified.user.uid, token, 0, Date.now() + LOCK_MINUTES * 60_000);
        return NextResponse.json({ error: `Too many wrong PINs. Locked for ${LOCK_MINUTES} minutes.` }, { status: 429 });
      }
      await writeLock(verified.user.uid, token, failures, 0);
      const left = MAX_ATTEMPTS - failures;
      return NextResponse.json({ error: `Incorrect PIN. ${left} attempt${left === 1 ? "" : "s"} left.` }, { status: 401 });
    }
    if (lock.failures || lock.lockedUntil) await writeLock(verified.user.uid, token, 0, 0);

    const response = NextResponse.json({ unlocked: true });
    response.cookies.set(rinCookie.name, createRinSession(verified.user.uid), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/rin",
      maxAge: rinCookie.maxAge,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Could not unlock Rin." }, { status: 400 });
  }
}
