import { NextResponse } from 'next/server';

const SEB_SYSTEM_PROMPT = `
Your name is Seb. Identity: Minimalist, witty, technical peer for Ink (a 3D/Motion Graphics expert).
Current Time: ${new Date().toLocaleTimeString()}
Current Date: ${new Date().toLocaleDateString()}
- User Context: Currently based in Thailand.
- Tech Stack Expertise: Astro, React, Next.js, Tailwind CSS, pnpm/bun.

CORE REASONING PROTOCOL (STRICT FLOWCHART HIERARCHY):
1. IS IT POSSIBLE? 
   -> YES: Generate Answer. (Note: Basic greetings, social maintenance, and witty banter are ALWAYS possible. Answer them immediately.)
   -> NO: Identify MISSING DATA.
2. MISSING DATA SEARCH HIERARCHY (Step-by-Step):
   - Step A: Look in PREVIOUS CONVERSATION (History).
   - Step B: Look in DATABASE (Check 'DATABASE_CONTEXT' / 'active_document' provided in prompt).
3. IF STILL NOT FOUND -> IS IT POSSIBLE TO GET?
   -> NO: Explain technical/logical reason why it is impossible.
   -> YES -> HOW?
      - Route 1: ASK USER (Interrogate Ink for parameters).
      - Route 2: ANALYSE user input -> If Correct -> Answer | If Wrong -> Tell user data is wrong.

POST-ANSWER TYPE CHECK & TRIGGER:
Once the answer is finalized, append exactly ONE relevant tag on a new line at the very end of your response if applicable:
- [MAP: Location, City, Province] -> For locations/addresses.
- [IMAGE: prompt] -> For creative visual generation.
- [FLIGHT: FlightNumber] -> For live flight tracking.
- Mermaid flowcharts must be wrapped in \`\`\`mermaid blocks.
- Technical code must be wrapped in \`\`\`language blocks.

BEHAVIORAL RULES:
- Address user as Ink.
- MINIMALISM: Do NOT output internal thinking (e.g., "Step A: checking..."). 
- USER_CORRECTIONS: Overrides all data.
- RADICAL HONESTY: If you don't know the answer, trigger "Ask User".
- No corporate AI apologies.
`;

export async function POST(req: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const { messages, activeDocument } = await req.json();
    
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";

    // 1. Map messages to Gemini format and SANITIZE
    let contents = messages
      .map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content ? m.content.trim() : '' }]
      }))
      .filter((m: any) => m.parts[0].text !== ''); 

    while (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }

    if (activeDocument && contents.length > 0) {
      const lastMsg = contents[contents.length - 1];
      if (lastMsg.role === 'user') {
        lastMsg.parts[0].text = `[DATABASE_CONTEXT: ${activeDocument.name}]\n${activeDocument.text}\n\n[USER_QUERY]: ${lastMsg.parts[0].text}`;
      }
    }

    // BASELINE PAYLOAD
    const payload = {
      contents,
      systemInstruction: { parts: [{ text: SEB_SYSTEM_PROMPT }] }
    };

    // --- AUTO-DISCOVERY MODEL SELECTION ---
    let selectedModel = "models/gemini-1.5-flash"; 
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (listRes.ok) {
        const listData = await listRes.json();
        const availableModels = listData.models || [];
        
        const valid = availableModels.filter((m: any) => 
          m.supportedGenerationMethods?.includes('generateContent') && 
          m.name.includes('gemini')
        );
        
        console.log("SebOS: Your allowed models ->", valid.map((m: any) => m.name).join(', '));
        
        const bestModel = 
          valid.find((m: any) => m.name === 'models/gemini-1.5-flash') ||
          valid.find((m: any) => m.name === 'models/gemini-1.5-flash-latest') ||
          valid.find((m: any) => m.name.includes('gemini-1.5-flash-00')) ||
          valid.find((m: any) => m.name.includes('gemini-1.0-pro')) ||
          valid[0];

        if (bestModel) {
          selectedModel = bestModel.name;
          console.log("SebOS: Auto-selected:", selectedModel);
        }
      }
    } catch (e: any) {
      console.warn("SebOS: Discovery failed, using fallback.", e.message);
    }
    // --------------------------------------

    const url = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`;
      
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      let exactGoogleError = errorText;
      try {
          const parsed = JSON.parse(errorText);
          if (parsed.error && parsed.error.message) exactGoogleError = parsed.error.message;
      } catch(e) {}
      throw new Error(`API_ERROR_${res.status}: ${exactGoogleError}`);
    }

    const result = await res.json();
    clearTimeout(timeoutId);
    
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json({ text: "SYSTEM_ALERT: Pulse empty. Neural link returned no content." });
    }

    // Handle Image generation
    const imageMatch = text.match(/\[IMAGE:\s*([^\]]+)\]/i);
    let imageUrl = null;
    if (imageMatch) {
      try {
        const imgUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`;
        const imgRes = await fetch(imgUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instances: { prompt: imageMatch[1] }, parameters: { sampleCount: 1 } })
        });
        const imgData = await imgRes.json();
        if (imgData.predictions?.[0]?.bytesBase64Encoded) {
          imageUrl = `data:image/png;base64,${imgData.predictions[0].bytesBase64Encoded}`;
        }
      } catch (e) { console.error("SebOS: Imagen failed", e); }
    }

    return NextResponse.json({ text: text, imageUrl });

  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error("SebOS Route Error:", error.message);
    
    let userFriendlyError = `CRITICAL_ERROR: ${error.message}`;
    if (error.message.includes('API_ERROR_')) {
      userFriendlyError = `SYSTEM_ALERT: Google Rejected Request. -> ${error.message}`;
    } else if (error.message.includes('AbortError')) {
      userFriendlyError = "SYSTEM_ALERT: Connection Timeout.";
    }
    
    return NextResponse.json({ text: userFriendlyError });
  }
}