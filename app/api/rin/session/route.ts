import { NextResponse } from "next/server";
import { requireFirebaseUser, RIN_PRIVATE_MESSAGE } from "@/lib/server/auth";
import { verifyRinSession, rinCookie } from "@/lib/server/rin-session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const verified = await requireFirebaseUser(req, { deniedMessage: RIN_PRIVATE_MESSAGE });
  if (verified.error) return verified.error;
  const session = verifyRinSession(req, verified.user.uid);
  return NextResponse.json({ unlocked: Boolean(session) });
}

export async function DELETE(req: Request) {
  const response = NextResponse.json({ unlocked: false });
  response.cookies.set(rinCookie.name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/rin",
    maxAge: 0,
  });
  return response;
}
