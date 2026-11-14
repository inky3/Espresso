import { NextResponse } from "next/server";
import { requireFirebaseUser, PRIVATE_ASSISTANT_MESSAGE, RIN_PRIVATE_MESSAGE } from "@/lib/server/auth";

/** Lets the pages ask "is the signed-in account the owner?" before showing anything. */
export async function GET(req: Request) {
  const space = new URL(req.url).searchParams.get("space");
  const verified = await requireFirebaseUser(req, {
    deniedMessage: space === "rin" ? RIN_PRIVATE_MESSAGE : PRIVATE_ASSISTANT_MESSAGE,
  });
  if (verified.error) return verified.error;
  return NextResponse.json({ owner: true });
}
