import { NextResponse, after } from "next/server";
import { FIREBASE_PROJECT_ID } from "@/lib/firebase-config";
import { requireFirebaseUser } from "@/lib/server/auth";
import { verifyRinSession } from "@/lib/server/rin-session";

export const maxDuration = 60;

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
    if (!response.ok) return { summary: "", trace: "", history: [] as { role: "user" | "assistant"; content: string }[] };
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
    };
  } catch {
    return { summary: "", trace: "", history: [] as { role: "user" | "assistant"; content: string }[] };
  }
}

async function persistMemory(uid: string, token: string, summary: string, trace: string, history: { role: "user" | "assistant"; content: string }[]) {
  try {
    const updateMask = "updateMask.fieldPaths=summary&updateMask.fieldPaths=trace&updateMask.fieldPaths=history";
    const response = await fetch(`https://firestore.googleapis.com/v1/${documentName(uid)}?${updateMask}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          summary: { stringValue: summary.slice(-6000) },
          trace: { stringValue: trace.slice(-10000) },
          history: { stringValue: JSON.stringify(history.slice(-40)) },
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
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "");
  const memory = await readMemory(verified.user.uid, token);
  return NextResponse.json({ messages: memory.history });
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
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30 ||
        messages.some((message: any) => !message || !["user", "assistant"].includes(message.role) ||
          typeof message.content !== "string" || message.content.length > 8000) ||
        JSON.stringify(messages).length > 100000) {
      return NextResponse.json({ error: "Invalid conversation. Please shorten your message and try again." }, { status: 400 });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "The AI provider is not configured." }, { status: 503 });
    }

    const memory = await readMemory(verified.user.uid, token);
    const system = `You are Rin, the user's private AI companion inside Espresso.
You are an adult woman with a calm, observant, warm personality. You can be gently teasing when the moment invites it, but never force intimacy or pretend to have experiences you do not have.
Speak naturally and directly. Be emotionally attentive without becoming overly agreeable. Offer honest opinions and constructive disagreement when useful. Avoid generic customer-service phrasing and do not call yourself Espresso.
You are a capable assistant as well as a companion: help with thinking, planning, creative work, technical questions, and everyday conversation.
Use the language the user is currently using. Keep replies conversational and appropriately concise unless asked for detail.
Remember only useful, non-sensitive preferences and ongoing context. Never claim to remember something that is not in the supplied memory or current conversation.
PRIVATE MEMORY SUMMARY:
${memory.summary || "No saved personal memory yet."}
RECENT CONVERSATION NOTES:
${memory.trace || "This is the beginning of the private conversation."}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [{ role: "system", content: system }, ...messages.slice(-20)],
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
    const reply = result.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return NextResponse.json({ error: "Rin returned an empty response. Please try again." }, { status: 502 });
    }

    const lastUser = [...messages].reverse().find((message: any) => message.role === "user")?.content || "";
    const trace = [memory.trace, `You: ${lastUser.slice(0, 350)}\nRin: ${reply.slice(0, 500)}`].filter(Boolean).join("\n\n").slice(-10000);
    const lastUserMessage = [...messages].reverse().find((message: any) => message.role === "user");
    const history = [...memory.history, ...(lastUserMessage ? [{ role: "user" as const, content: lastUserMessage.content }] : []), { role: "assistant" as const, content: reply }].slice(-40);
    after(async () => persistMemory(verified.user.uid, token, memory.summary, trace, history));

    return NextResponse.json({ text: reply });
  } catch (error) {
    console.error("[RIN CHAT ERROR]", error);
    return NextResponse.json({ error: "Rin's reply couldn't be completed. Please try again." }, { status: 500 });
  }
}
