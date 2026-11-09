import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/server/auth";
import { verifyRinSession } from "@/lib/server/rin-session";
import { deriveRinState, isRinExpression } from "@/lib/rin/character-state";

export async function POST(req: Request) {
  const verified = await requireFirebaseUser(req);
  if (verified.error) return verified.error;
  if (!verifyRinSession(req, verified.user.uid)) {
    return NextResponse.json({ error: "Your Rin session has expired. Unlock Rin again." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const userText = typeof body.userText === "string" ? body.userText.slice(0, 4000) : "";
    const replyText = typeof body.replyText === "string" ? body.replyText.slice(0, 4000) : "";
    const manualExpression = body.manualExpression === null || body.manualExpression === undefined
      ? undefined
      : isRinExpression(body.manualExpression) ? body.manualExpression : null;

    if (manualExpression === null) {
      return NextResponse.json({ error: "Unsupported expression selection." }, { status: 400 });
    }

    return NextResponse.json({ state: deriveRinState(userText, replyText, manualExpression) });
  } catch {
    return NextResponse.json({ error: "Invalid character state request." }, { status: 400 });
  }
}
