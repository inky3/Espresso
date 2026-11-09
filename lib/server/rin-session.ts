import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "rin_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function secret() {
  const value = process.env.RIN_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("RIN_SESSION_SECRET must be at least 32 characters.");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createRinSession(uid: string) {
  const payload = Buffer.from(JSON.stringify({
    uid,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  })).toString("base64url");
  return payload + "." + sign(payload);
}

export function verifyRinSession(req: Request, expectedUid?: string) {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const cookie = cookieHeader.split(";").map((part) => part.trim())
      .find((part) => part.startsWith(COOKIE_NAME + "="));
    if (!cookie) return null;

    const value = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return null;

    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.uid !== "string" || data.exp <= Math.floor(Date.now() / 1000)) return null;
    if (expectedUid && data.uid !== expectedUid) return null;
    return { uid: data.uid, expiresAt: data.exp };
  } catch {
    return null;
  }
}

export const rinCookie = {
  name: COOKIE_NAME,
  maxAge: SESSION_TTL_SECONDS,
};
