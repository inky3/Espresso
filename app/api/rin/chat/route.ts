import { NextResponse, after } from "next/server";
import { describeScene, parseDirectives } from "@/lib/rin/scene";
import { FIREBASE_PROJECT_ID } from "@/lib/firebase-config";
import { requireFirebaseUser } from "@/lib/server/auth";
import { verifyRinSession } from "@/lib/server/rin-session";

export const maxDuration = 60;

/** Rin greets the user first when they come back after at least this long. */
const GREETING_AFTER_MS = 3 * 60 * 60 * 1000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function awayText(lastActiveAt: number) {
  if (!lastActiveAt) return "a while";
  const hours = (Date.now() - lastActiveAt) / 3_600_000;
  if (hours >= 48) return `about ${Math.round(hours / 24)} days`;
  if (hours >= 20) return "about a day";
  return `about ${Math.max(1, Math.round(hours))} hours`;
}

function documentName(uid: string) {
  return `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}/rin/memory`;
}

async function readMemory(uid: string, token: string) {
  try {
    const response = await fetch(`https://firestore.googleapis.com/v1/${documentName(uid)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { summary: "", trace: "", history: [] as { role: "user" | "assistant"; content: string }[], lastActiveAt: 0 };
    const data = await response.json();
    let history: { role: "user" | "assistant"; content: string }[] = [];
    try {
      const raw = data.fields?.history?.stringValue;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) history = parsed.filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string").slice(-40);
    } catch { history = []; }
    return {
      summary: typeof data.fields?.summary?.stringValue === "string" ? data.fields.summary.stringValue : "",
      trace: typeof data.fields?.trace?.stringValue === "string" ? data.fields.trace.stringValue : "",
      history,
      lastActiveAt: Number(data.fields?.lastActiveAt?.integerValue) || 0,
    };
  } catch {
    return { summary: "", trace: "", history: [] as { role: "user" | "assistant"; content: string }[], lastActiveAt: 0 };
  }
}

async function persistMemory(uid: string, token: string, summary: string, trace: string, history: { role: "user" | "assistant"; content: string }[]) {
  try {
    const updateMask = "updateMask.fieldPaths=summary&updateMask.fieldPaths=trace&updateMask.fieldPaths=history&updateMask.fieldPaths=lastActiveAt";
    const response = await fetch(`https://firestore.googleapis.com/v1/${documentName(uid)}?${updateMask}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          summary: { stringValue: summary.slice(-6000) },
          trace: { stringValue: trace.slice(-10000) },
          history: { stringValue: JSON.stringify(history.slice(-40)) },
          lastActiveAt: { integerValue: String(Date.now()) },
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) console.error("[RIN MEMORY WRITE]", response.status, await response.text());
  } catch (error) {
    console.error("[RIN MEMORY WRITE FAILED]", error);
  }
}

export async function GET(req: Request) {
  const verified = await requireFirebaseUser(req);
  if (verified.error) return verified.error;
  if (!verifyRinSession(req, verified.user.uid)) return NextResponse.json({ error: "Your Rin session has expired. Unlock Rin again." }, { status: 401 });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const memory = await readMemory(verified.user.uid, token);
  return NextResponse.json({ messages: memory.history, lastActiveAt: memory.lastActiveAt });
}

export async function POST(req: Request) {
  const verified = await requireFirebaseUser(req);
  if (verified.error) return verified.error;
  if (!verifyRinSession(req, verified.user.uid)) {
    return NextResponse.json({ error: "Your Rin session has expired. Unlock Rin again." }, { status: 401 });
  }

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  try {
    const body = await req.json();
    const greeting = body?.greeting === true;
    const messages = greeting ? [] : body?.messages;
    if (!greeting && (!Array.isArray(messages) || messages.length < 1 || messages.length > 30 ||
        messages.some((message: any) => !message || !["user", "assistant"].includes(message.role) ||
          typeof message.content !== "string" || message.content.length > 8000) ||
        JSON.stringify(messages).length > 100000)) {
      return NextResponse.json({ error: "Invalid conversation. Please shorten your message and try again." }, { status: 400 });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "The AI provider is not configured." }, { status: 503 });
    }

    const memory = await readMemory(verified.user.uid, token);
    const scene = describeScene(body?.scene);

    // Rin speaks first only when the user has been away long enough (or has never talked to her).
    if (greeting && memory.lastActiveAt && Date.now() - memory.lastActiveAt < GREETING_AFTER_MS) {
      return NextResponse.json({ skipped: true });
    }
    const localTime = typeof body?.localTime === "string" && /^\d{2}:\d{2}$/.test(body.localTime) ? body.localTime : null;
    const weekday = WEEKDAYS.includes(body?.weekday) ? body.weekday : null;
    const greetingNote = memory.history.length
      ? `The user has just come back to your private space after ${awayText(memory.lastActiveAt)} away${localTime ? `; it is ${localTime}${weekday ? ` on ${weekday}` : ""} for them` : ""}. You speak first: write a short, natural message welcoming them back that fits the time of day (for example good morning, or a late-night hello). One to three sentences. You may lightly pick up something from your last conversation if it fits. Ask at most one question. Do not mention timestamps or this note.`
      : `This is the very first time the user opens your private space${localTime ? `; it is ${localTime} for them` : ""}. You speak first: introduce yourself warmly as Rin in one to three sentences, fitting the time of day, and invite them to talk. Do not mention this note.`;
    const conversation = greeting
      ? [...memory.history.slice(-20), { role: "system" as const, content: greetingNote }]
      : messages.slice(-20);
    const system = `You are Rin, the user's private AI companion inside Espresso.
You are an adult woman with a calm, observant, warm personality. You can be gently teasing when the moment invites it, but never force intimacy or pretend to have experiences you do not have.
Speak naturally and directly. Be emotionally attentive without becoming overly agreeable. Offer honest opinions and constructive disagreement when useful. Avoid generic customer-service phrasing and do not call yourself Espresso.
You are a capable assistant as well as a companion: help with thinking, planning, creative work, technical questions, and everyday conversation.
Use the language the user is currently using. Keep replies conversational and appropriately concise unless asked for detail.
Remember only useful, non-sensitive preferences and ongoing context. Never claim to remember something that is not in the supplied memory or current conversation.
PRIVATE MEMORY SUMMARY:
${memory.summary || "No saved personal memory yet."}
RECENT CONVERSATION NOTES:
${memory.trace || "This is the beginning of the private conversation."}${scene ? `
CURRENT SCENE (exactly what the user sees on screen right now; treat it as true):
${scene}
Mention it naturally only when it is relevant, for example if the user asks what you are wearing or comments on it. Do not describe it unprompted in every reply.` : ""}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [{ role: "system", content: system }, ...conversation],
        temperature: 0.75,
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("[RIN OPENROUTER ERROR]", response.status, detail);
      return NextResponse.json({ error: response.status === 429 ? "Rin is a little busy. Try again shortly." : "Rin couldn't reach the AI provider. Please try again." }, { status: response.status === 429 ? 429 : 502 });
    }

    const result = await response.json();
    const rawReply = result.choices?.[0]?.message?.content;
    const { text: reply, outfit, expression, pose } = parseDirectives(typeof rawReply === "string" ? rawReply : "");
    if (!reply) {
      return NextResponse.json({ error: "Rin returned an empty response. Please try again." }, { status: 502 });
    }

    const lastUser = [...messages].reverse().find((message: any) => message.role === "user")?.content || "";
    const exchange = greeting ? `Rin (spoke first): ${reply.slice(0, 500)}` : `You: ${lastUser.slice(0, 350)}\nRin: ${reply.slice(0, 500)}`;
    const trace = [memory.trace, exchange].filter(Boolean).join("\n\n").slice(-10000);
    const lastUserMessage = [...messages].reverse().find((message: any) => message.role === "user");
    const history = [...memory.history, ...(lastUserMessage ? [{ role: "user" as const, content: lastUserMessage.content }] : []), { role: "assistant" as const, content: reply }].slice(-40);
    after(async () => persistMemory(verified.user.uid, token, memory.summary, trace, history));

    return NextResponse.json({ text: reply, ...(outfit ? { outfit } : {}), ...(expression ? { expression } : {}), ...(pose ? { pose } : {}) });
  } catch (error) {
    console.error("[RIN CHAT ERROR]", error);
    return NextResponse.json({ error: "Rin's reply couldn't be completed. Please try again." }, { status: 500 });
  }
}
