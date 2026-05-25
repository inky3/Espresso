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
    const { messages } = await req.json();

    // Parallel fetch for speed
    const [hardSkills, softSkills] = await Promise.all([
      fetchCloudMemory('hard'),
      fetchCloudMemory('soft')
    ]);

    // Construct the context
    // Construct the context
    const systemInstruction = `You are Espresso. Context Memory:
      Hard Skills: ${hardSkills}
      Soft Skills: ${softSkills}

      System Protocols: 
      1. Memory Update: If you output [UPDATE_SKILL:(hard|soft):(content)], the system will persist it.
      2. Maps: If the user asks to see a location, find a place, or show a map, you MUST output exactly [MAP: Location Name] somewhere in your response. 
      3. Flights: If the user asks to track a flight, output exactly [FLIGHT: Flight Number] somewhere in your response.`;

    // Call API
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: systemInstruction }, ...messages]
      })
    });

    const result = await res.json();
    const finalReply = result.choices?.[0]?.message?.content || "";

    // Intercept tag and update DB
    const match = finalReply.match(/\[UPDATE_SKILL:(hard|soft):([\s\S]*?)\]/i);
    if (match) {
      const [_, type, content] = match;
      await updateCloudMemory(type as 'hard' | 'soft', content.trim());
    }

    return NextResponse.json({ text: finalReply });
  } catch (e) {
    return NextResponse.json({ text: "Error: Connection failed." }, { status: 500 });
  }
}

const [workspaceContent, setWorkspaceContent] = useState<string>('');

// Inside processCommand, update the fetch call to include the workspace:
const res = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    messages: [...messages, userMsg], 
    activeDocument,
    workspace: workspaceContent // Espresso can now read the whiteboard!
  }) 
});