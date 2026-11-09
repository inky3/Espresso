import { NextResponse } from "next/server";
import { FIREBASE_PROJECT_ID } from "@/lib/firebase-config";
import { requireFirebaseUser } from "@/lib/server/auth";

type MemoryType = "hard" | "soft" | "trace";

function memoryUrl(uid: string, type: MemoryType) {
  return "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID +
    "/databases/(default)/documents/users/" + uid + "/memory/" + type;
}

async function readMemory(uid: string, token: string, type: MemoryType) {
  try {
    const response = await fetch(memoryUrl(uid, type), {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    });
    if (!response.ok) return "";
    const data = await response.json();
    return data.fields?.content?.stringValue || "";
  } catch { return ""; }
}

async function writeMemory(uid: string, token: string, type: MemoryType, value: string, append = false) {
  try {
    let content = value;
    if (append) {
      const current = await readMemory(uid, token, type);
      content = type === "trace"
        ? [current, value].filter(Boolean).join("\n").slice(-2500)
        : [current, value].filter(Boolean).join(" | ").slice(-8000);
    }
    const response = await fetch(memoryUrl(uid, type), {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: { content: { stringValue: content } } }),
      cache: "no-store",
    });
    if (!response.ok) console.error("[MEMORY WRITE]", response.status, await response.text());
  } catch (error) { console.error("[MEMORY WRITE FAILED]", error); }
}

function messageText(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part: any) => typeof part?.text === "string" ? part.text : "").filter(Boolean).join("\n");
}

export async function POST(req: Request) {
  const verified = await requireFirebaseUser(req);
  if (verified.error) return verified.error;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "");

  try {
    const body = await req.json();
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 50 ||
        !messages.every((m: any) =>
          m && (m.role === "user" || m.role === "assistant") &&
          (typeof m.content === "string" || Array.isArray(m.content)) &&
          JSON.stringify(m.content).length <= 30000
        )) {
      return NextResponse.json({ error: "Invalid messages payload." }, { status: 400 });
    }

    const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
    const lastUserText = messageText(lastUser?.content).slice(0, 30000);
    const [hardSkills, softSkills, neuralTrace] = await Promise.all([
      readMemory(verified.user.uid, token, "hard"),
      readMemory(verified.user.uid, token, "soft"),
      readMemory(verified.user.uid, token, "trace"),
    ]);

    const hasThai = /[\u0E00-\u0E7F]/.test(lastUserText);
    const langLock = hasThai
      ? "Respond entirely in Thai using natural Thai phrasing."
      : "Respond entirely in English.";

    const systemInstruction = "You are Espresso, an advanced personal AI assistant.\n\n" +
      "COGNITIVE STATE:\nHard Skills: " + (hardSkills || "None yet.") +
      "\nSoft Skills: " + (softSkills || "None yet.") +
      "\nRecent Experience: " + (neuralTrace || "Session started.") +
      "\n\nLIVE WORKSPACE:\nActive Document: " +
      (typeof body.activeDocument?.name === "string" ? body.activeDocument.name.slice(0, 200) : "None") +
      "\nWhiteboard Contents: " + (typeof body.workspace === "string" ? body.workspace.slice(0, 12000) : "Empty") +
      "\n\n" + langLock +
      "\n\nSYSTEM PROTOCOLS:\n1. You are female." +
      "\n2. Use relevant memory for continuity." +
      "\n3. Preferences may be marked [LEARN: user likes X]." +
      "\n4. Explicit core-rule updates may be marked [UPDATE_SKILL:hard:(content)]." +
      "\n5. Location requests may be marked [MAP: Location Name]." +
      "\n6. Flight requests may be marked [FLIGHT: Flight Number]." +
      "\n7. Analyse attached images and answer the user's question." +
      "\n8. Never invent image URLs.";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [{ role: "system", content: systemInstruction }, ...messages],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.error("[OPENROUTER ERROR]", response.status, await response.text());
      return NextResponse.json({ error: "The AI provider rejected the request." }, { status: 502 });
    }

    const result = await response.json();
    let reply = result.choices?.[0]?.message?.content || "";

    const learnMatch = reply.match(/\[LEARN:\s*([^\]]+)\]/i);
    if (learnMatch) {
      await writeMemory(verified.user.uid, token, "soft", learnMatch[1].trim(), true);
      reply = reply.replace(learnMatch[0], "").trim();
    }

    const hardMatch = reply.match(/\[UPDATE_SKILL:hard:([\s\S]*?)\]/i);
    if (hardMatch) {
      await writeMemory(verified.user.uid, token, "hard", hardMatch[1].trim(), true);
      reply = reply.replace(hardMatch[0], "").trim();
    }

    const trace = "[Time: " + new Date().toISOString() + '] User: "' +
      lastUserText.slice(0, 80) + '" | Espresso: "' + reply.replace(/\[.*?\]/g, "").trim().slice(0, 150) + '"';
    await writeMemory(verified.user.uid, token, "trace", trace, true);

    return NextResponse.json({ text: reply });
  } catch (error) {
    console.error("[ESPRESSO API ERROR]", error);
    return NextResponse.json({ error: "The chat request could not be completed." }, { status: 500 });
  }
}
