import { NextResponse } from 'next/server';

// Fetch persistent memory from Firestore (Cloud L2 Cache)
async function fetchCloudMemory(type: 'hard' | 'soft') {
  try {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/espresso-23681/databases/(default)/documents/artifacts/espresso-terminal/memory/${type}`, { cache: 'no-store' });
    if (!res.ok) return "No active data.";
    const data = await res.json();
    return data.fields?.content?.stringValue || "No active data.";
  } catch (e) {
    return "Memory offline.";
  }
}

// Write updates back to Firestore via REST API
async function updateCloudMemory(type: 'hard' | 'soft', newContent: string) {
  try {
    await fetch(`https://firestore.googleapis.com/v1/projects/espresso-23681/databases/(default)/documents/artifacts/espresso-terminal/memory/${type}?currentDocument.exists=true`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { content: { stringValue: newContent } } })
    });
  } catch (e) {
    console.error("Failed to commit memory update", e);
  }
}

export async function POST(req: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const body = await req.json();
    const { messages, visionImage } = body;
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    // 1. Gather L2 Cloud Memory
    const hardSkills = await fetchCloudMemory('hard');
    const softSkills = await fetchCloudMemory('soft');

    // 2. Inject Memory into System Context
    const systemInstruction = `You are Espresso. Context Memory:\nHard Skills: ${hardSkills}\nSoft Skills: ${softSkills}\n\nProtocol: If you output [UPDATE_SKILL:(hard|soft):CONTENT], the system will persist it.`;
    
    let apiMessages = [{ role: "system", content: systemInstruction }, ...messages];

    // 3. Inference Request
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.NEXT_PUBLIC_SEB_MODEL || "google/gemini-2.5-pro",
        messages: apiMessages
      }),
      signal: controller.signal
    });

    const result = await res.json();
    const finalReply = result.choices?.[0]?.message?.content || "SYSTEM_ALERT: No output generated.";

    // 4. Intercept Memory Updates
    const updateMatch = finalReply.match(/\[UPDATE_SKILL:(hard|soft):(.*)\]/s);
    if (updateMatch) {
      const [_, type, newContent] = updateMatch;
      await updateCloudMemory(type as 'hard' | 'soft', newContent.trim());
    }

    clearTimeout(timeoutId);
    return NextResponse.json({ reply: finalReply });

  } catch (error) {
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}