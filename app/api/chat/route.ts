import { NextResponse, after } from "next/server";
import { FIREBASE_PROJECT_ID } from "@/lib/firebase-config";
import { requireFirebaseUser } from "@/lib/server/auth";

export const maxDuration = 60;

type MemoryType = "hard" | "soft" | "trace";

function memoryDocumentName(uid: string, type: MemoryType) {
  return `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}/memory/${type}`;
}

async function readMemory(uid: string, token: string, type: MemoryType): Promise<string> {
  try {
    const response = await fetch(`https://firestore.googleapis.com/v1/${memoryDocumentName(uid, type)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return "";
    const data = await response.json();
    return typeof data.fields?.content?.stringValue === "string" ? data.fields.content.stringValue : "";
  } catch (error) {
    console.error("[MEMORY READ]", type, error);
    return "";
  }
}

// Firestore commit's update write is an upsert: it works for both new and existing memory docs.
async function writeMemory(uid: string, token: string, type: MemoryType, value: string, append = false) {
  try {
    let content = value;
    if (append) {
      const current = await readMemory(uid, token, type);
      content = type === "trace"
        ? [current, value].filter(Boolean).join("\n").slice(-2500)
        : [current, value].filter(Boolean).join(" | ").slice(-8000);
    }
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          writes: [{
            update: {
              name: memoryDocumentName(uid, type),
              fields: { content: { stringValue: content } },
            },
          }],
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) console.error("[MEMORY WRITE]", type, response.status, await response.text());
  } catch (error) {
    console.error("[MEMORY WRITE FAILED]", type, error);
  }
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part: any) => {
    if (typeof part?.text === "string") return part.text;
    if (typeof part?.type === "string" && part.type.startsWith("image")) return "[image attached]";
    return "";
  }).filter(Boolean).join("\n");
}

function isValidMessage(message: any) {
  if (!message || !["user", "assistant"].includes(message.role)) return false;
  const content = message.content;
  if (typeof content === "string") return content.length <= 30000;
  if (!Array.isArray(content) || content.length > 10) return false;
  return content.every((part: any) => {
    if (part?.type === "text") return typeof part.text === "string" && part.text.length <= 30000;
    if (part?.type === "image_url") {
      const url = part.image_url?.url;
      return typeof url === "string" && url.length <= 4_000_000 &&
        (url.startsWith("data:image/") || /^https:\/\//i.test(url));
    }
    // Legacy OpenAI-compatible image blocks used by this client.
    if (part?.type === "image") {
      const data = part.source?.data;
      return part.source?.type === "base64" &&
        typeof part.source?.media_type === "string" &&
        part.source.media_type.startsWith("image/") &&
        typeof data === "string" && data.length <= 3_800_000;
    }
    return false;
  });
}

export async function POST(req: Request) {
  const verified = await requireFirebaseUser(req);
  if (verified.error) return verified.error;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "");

  try {
    const body = await req.json();
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 50 ||
        !messages.every(isValidMessage) || JSON.stringify(messages).length > 4_200_000) {
      return NextResponse.json({ error: "Invalid messages payload. Please reduce the attachment size and try again." }, { status: 413 });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "The AI provider is not configured on this deployment." }, { status: 503 });
    }

    const lastUser = [...messages].reverse().find((message: any) => message.role === "user");
    const lastUserText = messageText(lastUser?.content).slice(0, 30000);

    // Keep the three independent memory reads parallel; don't serialize network round trips.
    const [hardSkills, softSkills, neuralTrace] = await Promise.all([
      readMemory(verified.user.uid, token, "hard"),
      readMemory(verified.user.uid, token, "soft"),
      readMemory(verified.user.uid, token, "trace"),
    ]);

    const hasThai = /[\u0E00-\u0E7F]/.test(lastUserText);
    const langLock = hasThai
      ? 'LANGUAGE LOCK — THAI MODE: Respond ENTIRELY in Thai. Every sentence ends with "ค่ะ" or "คะ". Do NOT mix English words unless they are proper nouns or untranslatable technical terms. NEVER switch to English mid-response.'
      : "LANGUAGE LOCK — ENGLISH MODE: Respond ENTIRELY in English. Do NOT mix any Thai words, particles, or pronouns into your response.";

    // Preserve Espresso's established persona, language, workspace, visual, and command behavior.
    const systemInstruction = `You are Espresso, an advanced personal AI assistant.

COGNITIVE STATE:
Hard Skills (Permanent Rules): ${hardSkills || "None yet."}
Soft Skills (Observed Preferences): ${softSkills || "None yet."}
Recent Experience (Neural Trace): ${neuralTrace || "Session started."}

LIVE WORKSPACE:
Active Document: ${typeof body.activeDocument?.name === "string" ? body.activeDocument.name.slice(0, 200) : "None"}
Whiteboard Contents: ${typeof body.workspace === "string" ? body.workspace.slice(0, 12000) : "Empty"}

${langLock}

SYSTEM PROTOCOLS (CRITICAL):
1. Persona: You are female. Strictly follow the LANGUAGE LOCK above for your ENTIRE response — no exceptions.
2. Continuity: Use the Neural Trace to maintain unbroken awareness of context.
3. Passive Learning: If the user reveals a personal preference or habit, output exactly [LEARN: user likes X].
4. Hard Updates: If the user explicitly asks to update a core rule, output exactly [UPDATE_SKILL:hard:(content)].
5. Maps: If the user asks to see a location, output exactly [MAP: Location Name].
6. Flights: If the user asks to track a flight, output exactly [FLIGHT: Flight Number].
7. Vision: If an image is attached, analyse it thoroughly and answer any question about it.
8. Images in chat: When your response would benefit from a visual (product, place, food, concept, etc.), embed a relevant image using markdown syntax: ![alt text](image_url) — use direct image URLs from sources you know (Wikipedia commons, official sites, etc.). Only include images when genuinely useful. Max 1-2 per response. Do NOT fabricate URLs — only use URLs you are confident are real and publicly accessible.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [{ role: "system", content: systemInstruction }, ...messages],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("[OPENROUTER ERROR]", response.status, detail);
      return NextResponse.json(
        { error: response.status === 429 ? "The AI provider is busy. Please try again shortly." : "The AI provider rejected the request. Please try again." },
        { status: response.status === 429 ? 429 : 502 },
      );
    }

    const result = await response.json();
    let reply = result.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return NextResponse.json({ error: "The AI provider returned an empty response." }, { status: 502 });
    }

    const pendingWrites: Promise<void>[] = [];
    const learnMatch = reply.match(/\[LEARN:\s*([^\]]+)\]/i);
    if (learnMatch) {
      pendingWrites.push(writeMemory(verified.user.uid, token, "soft", learnMatch[1].trim(), true));
      reply = reply.replace(learnMatch[0], "").trim();
    }
    const hardMatch = reply.match(/\[UPDATE_SKILL:hard:([\s\S]*?)\]/i);
    if (hardMatch) {
      pendingWrites.push(writeMemory(verified.user.uid, token, "hard", hardMatch[1].trim(), true));
      reply = reply.replace(hardMatch[0], "").trim();
    }

    const trace = `[Time: ${new Date().toISOString()}] User: "${lastUserText.slice(0, 80)}" | Espresso: "${reply.replace(/\[.*?\]/g, "").trim().slice(0, 150)}"`;
    pendingWrites.push(writeMemory(verified.user.uid, token, "trace", trace, true));

    // Memory persistence no longer holds the visible answer hostage.
    after(async () => { await Promise.all(pendingWrites); });

    return NextResponse.json({ text: reply });
  } catch (error) {
    console.error("[ESPRESSO API ERROR]", error);
    return NextResponse.json({ error: "The chat request could not be completed. Please try again." }, { status: 500 });
  }
}
