import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const lastUserMessage = messages[messages.length - 1].content;
    
    // 1. HELPER: Fetch with Timeout (10s for stability)
    const fetchWithTimeout = async (url: string, options: any, timeout = 10000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
    };

    // 2. PRIMARY: GOOGLE GEMINI
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      try {
        const googleRes = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: lastUserMessage }] }]
            })
          }
        );
        if (googleRes.ok) {
          const data = await googleRes.json();
          if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return NextResponse.json({ text: data.candidates[0].content.parts[0].text });
          }
        }
      } catch (e) { console.log("Cloud Logic: Google link failed."); }
    }

    // 3. SECONDARY: OPENROUTER
    if (process.env.OPENROUTER_API_KEY) {
      try {
        const orRes = await fetchWithTimeout(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: process.env.NEXT_PUBLIC_SEB_MODEL || "google/gemini-2.0-flash-lite:free",
              messages: messages
            })
          }
        );
        if (orRes.ok) {
          const data = await orRes.json();
          return NextResponse.json({ text: data.choices[0].message.content });
        }
      } catch (e) { console.log("Cloud Logic: OpenRouter link failed."); }
    }

    return NextResponse.json({ 
      text: "SYSTEM_ALERT: All cloud links offline. Verify Vercel environment variables." 
    });

  } catch (error: any) {
    return NextResponse.json({ text: "CRITICAL: Brain core failed to initialize." }, { status: 200 });
  }
}