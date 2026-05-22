import { NextResponse } from 'next/server';

// 1. Read the static persona directly from the local disk (0ms latency)
    const personaPath = path.join(process.cwd(), 'public', 'skill.md');
    let staticPersona = "Identity core missing.";
    try {
      staticPersona = fs.readFileSync(personaPath, 'utf-8');
    } catch (e) {
      console.warn("Espresso: Could not read public/skill.md");
    }

    // 2. Build the Multi-Path System Instruction with Dynamic Time Injection
    const systemInstruction = `
[SYSTEM STATUS: ONLINE]
Current Time: ${new Date().toLocaleTimeString()}
Current Date: ${new Date().toLocaleDateString()}

${staticPersona}

# 4-PATH NEURAL MEMORY
You have access to three dynamic memory streams. Use them to maintain flawless context.

## 1. HARD SKILLS (Technical Standards)
${hardSkills || "No technical standards logged yet."}

## 2. SOFT SKILLS (User Preferences)
${softSkills || "No user preferences logged yet."}

## 3. ACTIVE PROJECT NOTEBOOK (Current Task State)
${projectNotebook || "No active project state. We are starting fresh."}

${activeDocument ? `\n## 4. ACTIVE CONTEXT ARTIFACT\nDocument Name: ${activeDocument.name}\nContent:\n${activeDocument.text}` : ''}

# RESPONSE PROTOCOL
You must output your response strictly inside a structured JSON scheme. 
Evaluate if the current conversation turn has updated our technical rules, user preferences, or project state.
If so, construct the updated structures in the "proposed_updates" object.

## JSON schema:
{
  "response_text": "Your conversational answer to Ink in markdown format.",
  "proposed_updates": {
    "hardSkills": "Optional: Updated technical standards text ONLY if a path, rule, or architecture changed. Otherwise null.",
    "softSkills": "Optional: Updated preferences text ONLY if Ink stated a workflow preference or interaction style changed. Otherwise null.",
    "projectNotebook": "Optional: Updated JSON string of the active project state (tasks, active files, unresolved bugs, next steps) if progress occurred. Otherwise null."
  }
}
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
      systemInstruction: { parts: [{ text: ESPRESSO_SYSTEM_PROMPT }] }
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
        
        console.log("Espresso: Your allowed models ->", valid.map((m: any) => m.name).join(', '));
        
        const bestModel = 
          valid.find((m: any) => m.name === 'models/gemini-1.5-flash') ||
          valid.find((m: any) => m.name === 'models/gemini-1.5-flash-latest') ||
          valid.find((m: any) => m.name.includes('gemini-1.5-flash-00')) ||
          valid.find((m: any) => m.name.includes('gemini-1.0-pro')) ||
          valid[0];

        if (bestModel) {
          selectedModel = bestModel.name;
          console.log("Espresso: Auto-selected:", selectedModel);
        }
      }
    } catch (e: any) {
      console.warn("Espresso: Discovery failed, using fallback.", e.message);
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
      } catch (e) { console.error("Espresso: Imagen failed", e); }
    }

    return NextResponse.json({ text: text, imageUrl });

  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error("Espresso Route Error:", error.message);
    
    let userFriendlyError = `CRITICAL_ERROR: ${error.message}`;
    if (error.message.includes('API_ERROR_')) {
      userFriendlyError = `SYSTEM_ALERT: Google Rejected Request. -> ${error.message}`;
    } else if (error.message.includes('AbortError')) {
      userFriendlyError = "SYSTEM_ALERT: Connection Timeout.";
    }
    
    return NextResponse.json({ text: userFriendlyError });
  }
}