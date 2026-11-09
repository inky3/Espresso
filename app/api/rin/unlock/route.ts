import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireFirebaseUser } from "@/lib/server/auth";
import { createRinSession, rinCookie } from "@/lib/server/rin-session";

export const runtime = "nodejs";

// Best-effort per-instance throttling. Use a shared rate-limit store before production scale-out.
const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: Request) {
  const verified = await requireFirebaseUser(req);
  if (verified.error) return verified.error;

  const now = Date.now();
  const current = attempts.get(verified.user.uid);
  if (current && current.resetAt > now && current.count >= 5) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }
  if (!current || current.resetAt <= now) {
    attempts.set(verified.user.uid, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    current.count += 1;
  }

  const configuredPin = process.env.RIN_ACCESS_PIN;
  if (!configuredPin) {
    return NextResponse.json({ error: "Rin access is not configured on the server." }, { status: 503 });
  }
  if (!process.env.RIN_SESSION_SECRET || process.env.RIN_SESSION_SECRET.length < 32) {
    return NextResponse.json({ error: "Rin session security is not configured." }, { status: 503 });
  }

  try {
    const body = await req.json();
    const pin = typeof body?.pin === "string" ? body.pin : "";
    const expected = Buffer.from(configuredPin);
    const supplied = Buffer.from(pin);
    const valid = expected.length === supplied.length && timingSafeEqual(expected, supplied);

    if (!valid) {
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    attempts.delete(verified.user.uid);
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
