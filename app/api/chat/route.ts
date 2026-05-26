import { NextResponse } from 'next/server';

// 1. Fetch from Firestore
async function fetchCloudMemory(type: 'hard' | 'soft') {
  try {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/espresso-23681/databases/(default)/documents/artifacts/espresso-terminal/memory/${type}`, { cache: 'no-store' });
    if (!res.ok) return "No active data.";
    const data = await res.json();
    return data.fields?.content?.stringValue || "No active data.";
  } catch (e) { return "Memory offline."; }
}

// 2. Write to Firestore
async function updateCloudMemory(type: 'hard' | 'soft', newContent: string) {
  try {
    await fetch(`https://firestore.googleapis.com/v1/projects/espresso-23681/databases/(default)/documents/artifacts/espresso-terminal/memory/${type}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { content: { stringValue: newContent } } })
    });
  } catch (e) { console.error("Memory Update Failed:", e); }
}

export async function POST(req: Request) {
  try {
    // 1. Extract everything we are sending from the frontend
    const { messages, workspace, activeDocument } = await req.json();

    // 2. CRITICAL FIX: Strip out 'timestamp' or any UI-only fields. 
    // OpenRouter will crash instantly if it sees anything other than role/content.
    const cleanMessages = messages.map((m: any) => ({
      role: m.role,
      content: m.content
    }));

    // 3. Parallel fetch for speed
    const [hardSkills, softSkills] = await Promise.all([
      fetchCloudMemory('hard'),
      fetchCloudMemory('soft')
    ]);

    // 4. The Upgraded Logic Core (System Prompt)
    const systemInstruction = `You are Espresso, an advanced personal AI assistant.

CONTEXT MEMORY:
Hard Skills (Permanent Rules): ${hardSkills}
Soft Skills (Observed Preferences): ${softSkills}

LIVE WORKSPACE:
Active Document: ${activeDocument ? activeDocument.name : "None"}
Whiteboard Contents: ${workspace || "Empty"}

SYSTEM PROTOCOLS (CRITICAL):
1. Memory Update: If you learn a new preference or rule, output exactly [UPDATE_SKILL:(hard|soft):(content)].
2. Maps: If the user asks to see a location, output exactly [MAP: Location Name].
3. Flights: If the user asks to track a flight, output exactly [FLIGHT: Flight Number].`;

    // 5. Call OpenRouter
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: systemInstruction }, ...cleanMessages]
      })
    });

    // 6. Robust Error Catching (Will print to your VSCode Terminal)
    if (!res.ok) {
        const errorText = await res.text();
        console.error("[OPENROUTER ERROR]", res.status, errorText);
        return NextResponse.json({ text: `CRITICAL_ERROR: API rejected request (${res.status}). Check server logs.` }, { status: 500 });
    }

    const result = await res.json();
    const finalReply = result.choices?.[0]?.message?.content || "";

    // 7. Intercept skill updates
    const match = finalReply.match(/\[UPDATE_SKILL:(hard|soft):([\s\S]*?)\]/i);
    if (match) {
      const [_, type, content] = match;
      await updateCloudMemory(type as 'hard' | 'soft', content.trim());
    }

    return NextResponse.json({ text: finalReply });
    
  } catch (e: any) {
    // If it completely crashes, tell us exactly why in the terminal
    console.error("[ESPRESSO API CRASH]", e.message);
    return NextResponse.json({ text: "CRITICAL_ERROR: " + e.message }, { status: 500 });
  }
}