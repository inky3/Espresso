import { NextResponse } from "next/server";
import { requireFirebaseUser, RIN_PRIVATE_MESSAGE } from "@/lib/server/auth";
import { verifyRinSession } from "@/lib/server/rin-session";
import {
  deriveRinState,
  isRinEnvironment,
  isRinExpression,
  isRinOutfit,
  isRinPose,
} from "@/lib/rin/character-state";

export async function POST(req: Request) {
  const verified = await requireFirebaseUser(req, { deniedMessage: RIN_PRIVATE_MESSAGE });
  if (verified.error) return verified.error;
  if (!verifyRinSession(req, verified.user.uid)) {
    return NextResponse.json({ error: "Your Rin session has expired. Unlock Rin again." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const userText = typeof body.userText === "string" ? body.userText.slice(0, 4000) : "";
    const replyText = typeof body.replyText === "string" ? body.replyText.slice(0, 4000) : "";
    const overrides: Record<string, string> = {};

    if (body.manualExpression != null) {
      if (!isRinExpression(body.manualExpression)) return NextResponse.json({ error: "Unsupported expression selection." }, { status: 400 });
      overrides.expression = body.manualExpression;
    }
    if (body.manualOutfit != null) {
      if (!isRinOutfit(body.manualOutfit)) return NextResponse.json({ error: "Unsupported outfit selection." }, { status: 400 });
      overrides.outfit = body.manualOutfit;
    }
    if (body.manualPose != null) {
      if (!isRinPose(body.manualPose)) return NextResponse.json({ error: "Unsupported pose selection." }, { status: 400 });
      overrides.pose = body.manualPose;
    }
    if (body.manualEnvironment != null) {
      if (!isRinEnvironment(body.manualEnvironment)) return NextResponse.json({ error: "Unsupported environment selection." }, { status: 400 });
      overrides.environment = body.manualEnvironment;
    }

    return NextResponse.json({ state: deriveRinState(userText, replyText, overrides) });
  } catch {
    return NextResponse.json({ error: "Invalid character state request." }, { status: 400 });
  }
}
