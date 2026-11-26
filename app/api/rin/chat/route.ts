import { NextResponse, after } from "next/server";
import { describeScene, gateChoices, limitActions, parseDirectives } from "@/lib/rin/scene";
import { deriveRinState } from "@/lib/rin/character-state";
import { applyFactOps, CALM, decayMood, mindSection, moodFace, parseReflection, reflectionPrompt, RIN_PERSONA, stepMood, type Fact, type Mood } from "@/lib/rin/mind";
import { FIREBASE_PROJECT_ID } from "@/lib/firebase-config";
import { requireFirebaseUser, RIN_PRIVATE_MESSAGE } from "@/lib/server/auth";
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

type Msg = { role: "user" | "assistant"; content: string };
const EMPTY_MEMORY = () => ({ summary: "", trace: "", history: [] as Msg[], lastActiveAt: 0, facts: [] as Fact[], mood: CALM, story: "" });
function parseJson<T>(raw: unknown, fallback: T): T {
  try { return typeof raw === "string" && raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

async function readMemory(uid: string, token: string) {
  try {
    const response = await fetch(`https://firestore.googleapis.com/v1/${documentName(uid)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return EMPTY_MEMORY();
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
      facts: parseJson<Fact[]>(data.fields?.facts?.stringValue, []).filter((f) => f && typeof f.id === "string" && typeof f.text === "string"),
      mood: { ...CALM, ...parseJson<Partial<Mood>>(data.fields?.mood?.stringValue, {}) } as Mood,
      story: typeof data.fields?.story?.stringValue === "string" ? data.fields.story.stringValue : "",
    };
  } catch {
    return EMPTY_MEMORY();
  }
}

async function persistMemory(uid: string, token: string, summary: string, trace: string, history: Msg[], mind?: { facts: Fact[]; mood: Mood; story: string }) {
  try {
    const fields = ["summary", "trace", "history", "lastActiveAt", ...(mind ? ["facts", "mood", "story"] : [])];
    const updateMask = fields.map((f) => `updateMask.fieldPaths=${f}`).join("&");
    const response = await fetch(`https://firestore.googleapis.com/v1/${documentName(uid)}?${updateMask}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          summary: { stringValue: summary.slice(-6000) },
          trace: { stringValue: trace.slice(-10000) },
          history: { stringValue: JSON.stringify(history.slice(-40)) },
          lastActiveAt: { integerValue: String(Date.now()) },
          ...(mind ? {
            facts: { stringValue: JSON.stringify(mind.facts) },
            mood: { stringValue: JSON.stringify(mind.mood) },
            story: { stringValue: mind.story.slice(0, 1500) },
          } : {}),
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

/** Background pass: asks the model how the story, mood and memory change after this exchange. Returns undefined on failure. */
async function reflect(input: { story: string; facts: Fact[]; mood: Mood; recent: Msg[] }) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        models: ["deepseek/deepseek-v4.1-flash-1017", "qwen/qwen3.8-27b"], // memory/mood bookkeeping stays on DeepSeek whatever RIN_MODEL is
        messages: [{ role: "user", content: reflectionPrompt(input) }],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) { console.error("[RIN REFLECT]", response.status); return undefined; }
    const data = parseReflection(String((await response.json()).choices?.[0]?.message?.content ?? ""));
    if (!data) { console.error("[RIN REFLECT] unreadable"); return undefined; }
    return {
      story: data.story ?? input.story,
      mood: stepMood(input.mood, data.mood ?? null),
      facts: applyFactOps(input.facts, data.memory),
    };
  } catch (error) {
    console.error("[RIN REFLECT FAILED]", error);
    return undefined;
  }
}

export async function GET(req: Request) {
  const verified = await requireFirebaseUser(req, { deniedMessage: RIN_PRIVATE_MESSAGE });
  if (verified.error) return verified.error;
  if (!verifyRinSession(req, verified.user.uid)) return NextResponse.json({ error: "Your Rin session has expired. Unlock Rin again." }, { status: 401 });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const memory = await readMemory(verified.user.uid, token);
  return NextResponse.json({ messages: memory.history, lastActiveAt: memory.lastActiveAt, idleExpression: moodFace(decayMood(memory.mood)) });
}

/** Start fresh: clears the conversation and its story, keeps long-term facts; mood back to calm. */
export async function DELETE(req: Request) {
  const verified = await requireFirebaseUser(req, { deniedMessage: RIN_PRIVATE_MESSAGE });
  if (verified.error) return verified.error;
  if (!verifyRinSession(req, verified.user.uid)) return NextResponse.json({ error: "Your Rin session has expired. Unlock Rin again." }, { status: 401 });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const memory = await readMemory(verified.user.uid, token);
  await persistMemory(verified.user.uid, token, memory.summary, "", [], { facts: memory.facts, mood: CALM, story: "" });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const verified = await requireFirebaseUser(req, { deniedMessage: RIN_PRIVATE_MESSAGE });
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
    const mood = decayMood(memory.mood);
    const system = `${RIN_PERSONA}

You and the user are close, and this is your shared private space: when he compliments you, flirts, or comments on how you look or what you are wearing, enjoy it and answer in character. Do not deflect, lecture or change the subject. Do not pretend to have experiences you do not have, and do not call yourself Espresso.
You are also genuinely capable: help with thinking, planning, creative work, technical questions and everyday things, in your own voice.
Use the language he is currently using. Keep replies conversational and concise unless he asks for detail.
Never claim to remember something that is not below or in this conversation.

${mindSection({ story: memory.story, facts: memory.facts, mood })}${memory.summary ? `
OLDER NOTES: ${memory.summary}` : ""}${!memory.story && memory.trace ? `
EARLIER CONVERSATION NOTES:
${memory.trace.slice(-3000)}` : ""}${scene ? `
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
        // OpenRouter tries these in order, so a wrong or unavailable first ID falls back to the old model.
        models: [process.env.RIN_MODEL || "thedrummer/cydonia-24b-v4.1"], // uncensored roleplay model; RIN_MODEL in Vercel overrides it,
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
    console.log("[RIN MODEL]", result.model);
    const rawReply = result.choices?.[0]?.message?.content;
    console.log("[RIN MODEL]", result.model ?? "unknown", result.provider ?? "");
    const parsed = parseDirectives(limitActions(typeof rawReply === "string" ? rawReply : ""));
    const reply = parsed.text;
    if (!reply) {
      return NextResponse.json({ error: "Rin returned an empty response. Please try again." }, { status: 502 });
    }

    const lastUser = [...messages].reverse().find((message: any) => message.role === "user")?.content || "";
    const userMessages = greeting ? [] : (messages as { role: string; content: string }[]).filter((m) => m.role === "user").map((m) => m.content);
    const { outfit, room } = gateChoices(parsed, { greeting, userMessages, scene: body?.scene, localTime, recent: greeting ? [] : [...(messages as { content: string }[]).slice(-3).map((m) => m.content), reply] });
    // One state per reply: Rin's own face/pose first, else a reaction to what the user said.
    const reaction = greeting ? null : deriveRinState(lastUser, reply);
    // Face priority: Rin's own choice > a clear reaction to his message > her current mood (never a blank reset).
    const expression = parsed.expression ?? (reaction && reaction.expression !== "neutral" ? reaction.expression : moodFace(mood));
    const pose = parsed.pose;
    const reactionPose = pose ? undefined : reaction?.reactionPose ?? undefined;
    const exchange = greeting ? `Rin (spoke first): ${reply.slice(0, 500)}` : `You: ${lastUser.slice(0, 350)}\nRin: ${reply.slice(0, 500)}`;
    const trace = [memory.trace, exchange].filter(Boolean).join("\n\n").slice(-10000);
    const lastUserMessage = [...messages].reverse().find((message: any) => message.role === "user");
    const history = [...memory.history, ...(lastUserMessage ? [{ role: "user" as const, content: lastUserMessage.content }] : []), { role: "assistant" as const, content: reply }].slice(-40);
    // After the reply is sent: update the story, mood and long-term memory in the background.
    after(async () => {
      const mind = greeting ? undefined : await reflect({ story: memory.story, facts: memory.facts, mood, recent: history.slice(-6) });
      await persistMemory(verified.user.uid, token, memory.summary, trace, history, mind);
    });

    return NextResponse.json({ text: reply, ...(outfit ? { outfit } : {}), ...(expression ? { expression } : {}), ...(pose ? { pose } : {}), ...(reactionPose ? { reactionPose } : {}), ...(room ? { room } : {}), ...(parsed.beats.length > 1 ? { beats: parsed.beats } : {}) });
  } catch (error) {
    console.error("[RIN CHAT ERROR]", error);
    return NextResponse.json({ error: "Rin's reply couldn't be completed. Please try again." }, { status: 500 });
  }
}
