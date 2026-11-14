import { NextResponse } from "next/server";
import { FIREBASE_API_KEY } from "../firebase-config";

export type VerifiedUser = { uid: string; email: string };

export const PRIVATE_ASSISTANT_MESSAGE = "This is a private assistant.";
export const RIN_PRIVATE_MESSAGE = "This is a personal space. Leave immediately.";

/** Owner emails from OWNER_EMAILS (comma-separated). Empty means nobody is allowed. */
function ownerEmails() {
  return (process.env.OWNER_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verifies the Firebase ID token AND that it belongs to the owner: a verified
 * Google sign-in whose email is listed in OWNER_EMAILS. Anonymous users and
 * everyone else are refused, so nobody else can use the paid AI routes.
 *
 * Errors carry a `code`: "sign_in_required" (no Google sign-in yet) or
 * "not_owner" (signed in with someone else's account).
 */
export async function requireFirebaseUser(
  req: Request,
  { deniedMessage = PRIVATE_ASSISTANT_MESSAGE }: { deniedMessage?: string } = {},
): Promise<
  | { user: VerifiedUser; error?: never }
  | { user?: never; error: NextResponse }
> {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { error: NextResponse.json({ error: "Authentication required.", code: "sign_in_required" }, { status: 401 }) };
  }

  const owners = ownerEmails();
  if (!owners.length) {
    // Fail closed: without a configured owner, nobody gets in.
    return { error: NextResponse.json({ error: "Owner access is not configured on the server (OWNER_EMAILS)." }, { status: 503 }) };
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
    const account = payload.users?.[0];
    const uid = account?.localId;
    if (typeof uid !== "string" || !uid) {
      return { error: NextResponse.json({ error: "Invalid session." }, { status: 401 }) };
    }

    const providers: string[] = Array.isArray(account.providerUserInfo)
      ? account.providerUserInfo.map((info: { providerId?: unknown }) => String(info?.providerId))
      : [];
    if (!providers.includes("google.com")) {
      return { error: NextResponse.json({ error: "Sign in with Google to continue.", code: "sign_in_required" }, { status: 401 }) };
    }

    const email = typeof account.email === "string" ? account.email.toLowerCase() : "";
    if (!email || account.emailVerified !== true || !owners.includes(email)) {
      return { error: NextResponse.json({ error: deniedMessage, code: "not_owner" }, { status: 403 }) };
    }

    return { user: { uid, email } };
  } catch {
    return { error: NextResponse.json({ error: "Could not verify session." }, { status: 503 }) };
  }
}
