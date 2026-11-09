import { NextResponse } from "next/server";
import { FIREBASE_API_KEY } from "../firebase-config";

export type VerifiedUser = { uid: string };

export async function requireFirebaseUser(req: Request): Promise<
  | { user: VerifiedUser; error?: never }
  | { user?: never; error: NextResponse }
> {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\\s+(.+)$/i);
  if (!match) {
    return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: match[1] }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return { error: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }) };
    }

    const payload = await response.json();
    const uid = payload.users?.[0]?.localId;
    if (typeof uid !== "string" || !uid) {
      return { error: NextResponse.json({ error: "Invalid session." }, { status: 401 }) };
    }

    return { user: { uid } };
  } catch {
    return { error: NextResponse.json({ error: "Could not verify session." }, { status: 503 }) };
  }
}
