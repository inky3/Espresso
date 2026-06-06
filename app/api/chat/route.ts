import { NextResponse } from 'next/server';

// ─── Firestore helpers ────────────────────────────────────────────────────────
async function fetchCloudMemory(type: 'hard' | 'soft' | 'trace') {
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/espresso-23681/databases/(default)/documents/artifacts/espresso-terminal/memory/${type}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return "";
    const data = await res.json();
    return data.fields?.content?.stringValue || "";
  } catch { return ""; }
}

async function updateCloudMemory(type: 'hard' | 'soft' | 'trace', newContent: string, append = false) {
  try {
    let finalContent = newContent;
    if (append) {
      const current = await fetchCloudMemory(type);
      if (type === 'trace') {
        finalContent = current ? `${current}\n${newContent}` : newContent;
        if (finalContent.length > 2500) finalContent = finalContent.substring(finalContent.length - 2500);
      } else {
        finalContent = current ? `${current} | ${newContent}` : newContent;
      }
    }
    await fetch(
      `https://firestore.googleapis.com/v1/projects/espresso-23681/databases/(default)/documents/artifacts/espresso-terminal/memory/${type}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { content: { stringValue: finalContent } } }),
      }
    );
  } catch (e) { console.error("Memory Update Failed:", e); }
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { messages, workspace, activeDocument } = await req.json();

    // Normalise messages — each content may be a string (text) or an array (vision).
    // We pass them through to OpenRouter as-is; Gemini 2.5 Pro understands the
    // OpenAI-compatible multimodal format.
    const cleanMessages = (messages as any[]).map((m) => ({
      role: m.role,
      content: m.content, // string | array (vision)
    }));

    const lastUserMessage =
      cleanMessages.filter((m) => m.role === 'user').pop()?.content ?? "";
    // For the trace log use a plain string summary
    const lastUserText = typeof lastUserMessage === 'string'
      ? lastUserMessage
      : (lastUserMessage as any[]).find((b: any) => b.type === 'text')?.text ?? "[vision input]";

    // Parallel memory fetch
    const [hardSkills, softSkills, neuralTrace] = await Promise.all([
      fetchCloudMemory('hard'),
      fetchCloudMemory('soft'),
      fetchCloudMemory('trace'),
    ]);

    // ── Detect user language ──────────────────────────────────────────────
    const hasThai = /[\u0E00-\u0E7F]/.test(lastUserText);
    const langLock = hasThai
      ? `LANGUAGE LOCK — THAI MODE: Respond ENTIRELY in Thai. Every sentence ends with "ค่ะ" or "คะ". Do NOT mix English words unless they are proper nouns or untranslatable technical terms. NEVER switch to English mid-response.`
      : `LANGUAGE LOCK — ENGLISH MODE: Respond ENTIRELY in English. Do NOT mix any Thai words, particles, or pronouns into your response.`;

    // ── System prompt ──────────────────────────────────────────────────────
    const systemInstruction = `You are Espresso, an advanced personal AI assistant.

COGNITIVE STATE:
Hard Skills (Permanent Rules): ${hardSkills || "None yet."}
Soft Skills (Observed Preferences): ${softSkills || "None yet."}
Recent Experience (Neural Trace): ${neuralTrace || "Session started."}

LIVE WORKSPACE:
Active Document: ${activeDocument ? activeDocument.name : "None"}
Whiteboard Contents: ${workspace || "Empty"}

${langLock}

SYSTEM PROTOCOLS (CRITICAL):
1. Persona: You are female. Strictly follow the LANGUAGE LOCK above for your ENTIRE response — no exceptions.
2. Continuity: Use the Neural Trace to maintain unbroken awareness of context.
3. Passive Learning: If the user reveals a personal preference or habit, output exactly [LEARN: user likes X].
4. Hard Updates: If the user explicitly asks to update a core rule, output [UPDATE_SKILL:hard:(content)].
5. Maps: If the user asks to see a location, output exactly [MAP: Location Name].
6. Flights: If the user asks to track a flight, output exactly [FLIGHT: Flight Number].
7. Vision: If an image is attached, analyse it thoroughly and answer any question about it.
8. Images in chat: When your response would benefit from a visual (product, place, food, concept, etc.), embed a relevant image using markdown syntax: ![alt text](image_url) — use direct image URLs from sources you know (Wikipedia commons, official sites, etc.). Only include images when genuinely useful. Max 1-2 per response. Do NOT fabricate URLs — only use URLs you are confident are real and publicly accessible.`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: systemInstruction }, ...cleanMessages],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[OPENROUTER ERROR]", res.status, errorText);
      return NextResponse.json(
        { text: `CRITICAL_ERROR: API rejected request (${res.status}).` },
        { status: 500 }
      );
    }

    const result = await res.json();
    let finalReply: string = result.choices?.[0]?.message?.content || "";

    // ── Intercept memory tags ───────────────────────────────────────────────
    const learnMatch = finalReply.match(/\[LEARN:\s*([^\]]+)\]/i);
    if (learnMatch) {
      await updateCloudMemory('soft', learnMatch[1].trim(), true);
      finalReply = finalReply.replace(learnMatch[0], '').trim();
    }

    const updateMatch = finalReply.match(/\[UPDATE_SKILL:hard:([\s\S]*?)\]/i);
    if (updateMatch) {
      await updateCloudMemory('hard', updateMatch[1].trim(), true);
      finalReply = finalReply.replace(updateMatch[0], '').trim();
    }

    // ── Neural trace (rolling log) ──────────────────────────────────────────
    const cleanTraceReply = finalReply.replace(/\[.*?\]/g, '').trim().substring(0, 150);
    const traceEntry = `[Time: ${new Date().toLocaleTimeString()}] User: "${lastUserText.substring(0, 80)}" | Espresso: "${cleanTraceReply}..."`;
    await updateCloudMemory('trace', traceEntry, true);

    return NextResponse.json({ text: finalReply });

  } catch (e: any) {
    console.error("[ESPRESSO API CRASH]", e.message);
    return NextResponse.json({ text: "CRITICAL_ERROR: " + e.message }, { status: 500 });
  }
}