'use client';

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { onAuthStateChanged, signInAnonymously, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function RinPage() {
  const [user, setUser] = useState<User | null>(null);
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [locking, setLocking] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [characterExpression, setCharacterExpression] = useState("neutral");
  const [manualExpression, setManualExpression] = useState("");
  const [characterOutfit, setCharacterOutfit] = useState("casual");
  const [manualOutfit, setManualOutfit] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (current) => {
      if (current) {
        setUser(current);
        try {
          const token = await current.getIdToken();
          const response = await fetch("/api/rin/session", {
            headers: { Authorization: "Bearer " + token },
            cache: "no-store",
          });
          const data = await response.json();
          setUnlocked(Boolean(data.unlocked));
          if (data.unlocked) {
            const historyResponse = await fetch("/api/rin/chat", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
            if (historyResponse.ok) {
              const historyData = await historyResponse.json();
              if (Array.isArray(historyData.messages)) setMessages(historyData.messages.filter((item: any) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string"));
            }
          }
        } catch {
          setUnlocked(false);
        }
        setChecking(false);
      } else {
        try {
          await signInAnonymously(auth);
        } catch {
          setError("Could not establish a secure session. Please reload and try again.");
          setChecking(false);
        }
      }
    });
    return unsubscribe;
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!user || !pin || busy) return;
    setBusy(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/rin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ pin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to unlock Rin.");
      setUnlocked(true);
      setPin("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to unlock Rin.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !user || sending) return;
    setDraft("");
    setChatError("");
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setSending(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/rin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ messages: nextMessages.slice(-20) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Rin couldn't reply.");
      if (typeof data.text !== "string" || !data.text.trim()) throw new Error("Rin returned an empty response.");
      setMessages((current) => [...current, { role: "assistant", content: data.text }]);
      try {
        const stateResponse = await fetch("/api/rin/state", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ userText: text, replyText: data.text, manualExpression: manualExpression || null, manualOutfit: manualOutfit || null }),
        });
        const stateData = await stateResponse.json();
        if (stateResponse.ok && typeof stateData.state?.expression === "string") setCharacterExpression(stateData.state.expression);
        if (stateResponse.ok && typeof stateData.state?.outfit === "string") setCharacterOutfit(stateData.state.outfit);
      } catch { /* Character state is an enhancement; it must not interrupt conversation. */ }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Message could not be sent.");
      setDraft((current) => current || text);
      setMessages((current) => current.filter((message, index) => !(index === current.length - 1 && message.role === "user" && message.content === text)));
    } finally {
      setSending(false);
    }
  }

  async function lock() {
    if (locking) return;
    setLocking(true);
    try {
      await fetch("/api/rin/session", { method: "DELETE" });
    } finally {
      setUnlocked(false);
      setPin("");
      setMessages([]);
      setCharacterExpression("neutral");
      setManualExpression("");
      setLocking(false);
    }
  }

  if (checking) {
    return <main className="min-h-[100dvh] bg-[#080808] text-zinc-500 grid place-items-center font-mono text-xs tracking-[0.2em]">ESTABLISHING PRIVATE SESSION…</main>;
  }

  return (
    <main className="relative h-[100dvh] overflow-y-auto overscroll-contain bg-[#080808] text-zinc-100 selection:bg-[#c9a85d]/30">
      {!unlocked ? (
        <div className="min-h-[100dvh] flex items-center justify-center px-5 py-10">
          <section className="w-full max-w-md">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-[#D4AF37]/70">Espresso / Private Space</p>
            <form onSubmit={unlock} className="rounded-2xl border border-white/10 bg-[#101010] p-7 sm:p-9">
              <h1 className="text-3xl font-light tracking-tight">Rin</h1>
              <p className="mb-8 mt-2 text-sm text-zinc-500">Enter your private access PIN to continue.</p>
              <label htmlFor="rin-pin" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Access PIN</label>
              <input id="rin-pin" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-lg tracking-[0.35em] outline-none focus:border-[#D4AF37]/60" />
              {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
              <button disabled={!pin || busy} className="mt-5 w-full rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40">{busy ? "Checking…" : "Unlock Rin"}</button>
            </form>
            <p className="mt-6 text-center font-mono text-[10px] text-zinc-700">PRIVATE · SESSION-BOUND · LOCKABLE</p>
          </section>
        </div>
      ) : (
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1600px] flex-col px-4 pb-4 pt-5 sm:px-7 sm:pt-7 lg:px-10">
          <header className="relative z-20 flex items-center justify-between border-b border-white/[0.07] pb-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.32em] text-[#c6a45b] sm:text-[10px]">Espresso <span className="px-1 text-zinc-700">/</span> Private Space</p>
              <p className="mt-1 text-xs text-zinc-500">A quieter corner, just for you.</p>
            </div>
            <button onClick={lock} disabled={locking} className="rounded-full border border-white/10 px-4 py-2 text-[11px] text-zinc-400 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50">{locking ? "Locking…" : "Lock space"}</button>
          </header>

          <div className="grid flex-1 grid-cols-1 gap-4 py-4 lg:min-h-[calc(100dvh-110px)] lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:gap-6 lg:py-6">
            <section className="relative isolate flex min-h-[calc(100dvh-112px)] flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#111115] lg:min-h-0">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,rgba(163,137,86,0.17),transparent_55%),linear-gradient(180deg,#17171b_0%,#0d0e11_100%)]" />
              <div className="relative z-10 flex items-start justify-between px-5 pt-5 sm:px-7 sm:pt-7">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-500">Your companion</p>
                  <h1 className="mt-1 text-2xl font-light tracking-tight sm:text-3xl">Rin</h1>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="rin-expression" className="sr-only">Character expression</label>
                  <select id="rin-expression" value={manualExpression} onChange={async (event) => {
                    const value = event.target.value;
                    setManualExpression(value);
                    if (!user) return;
                    try {
                      const token = await user.getIdToken();
                      const response = await fetch("/api/rin/state", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                        body: JSON.stringify({ manualExpression: value || null }),
                      });
                      const data = await response.json();
                      if (response.ok) setCharacterExpression(data.state.expression);
                    } catch { /* Keep the current expression if the state request fails. */ }
                  }} className="max-w-[118px] rounded-full border border-white/10 bg-[#111115] px-2 py-1.5 text-[10px] text-zinc-400 outline-none">
                    <option value="">Auto expression</option>
                    <option value="neutral">Neutral</option>
                    <option value="warm">Warm</option>
                    <option value="thoughtful">Thoughtful</option>
                    <option value="concerned">Concerned</option>
                    <option value="playful">Playful</option>
                  </select>
                  <label htmlFor="rin-outfit" className="sr-only">Character outfit</label>
                  <select id="rin-outfit" value={manualOutfit} onChange={async (event) => {
                    const value = event.target.value;
                    setManualOutfit(value);
                    if (!user) return;
                    try {
                      const token = await user.getIdToken();
                      const response = await fetch("/api/rin/state", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                        body: JSON.stringify({ manualOutfit: value || null }),
                      });
                      const data = await response.json();
                      if (response.ok && typeof data.state?.outfit === "string") setCharacterOutfit(data.state.outfit);
                    } catch { /* Keep the current outfit if the state request fails. */ }
                  }} className="max-w-[125px] rounded-full border border-white/10 bg-[#111115] px-2 py-1.5 text-[10px] text-zinc-400 outline-none">
                    <option value="">Auto outfit</option>
                    <option value="casual">Casual</option>
                    <option value="work">Work / Study</option>
                    <option value="relaxed">Relaxed</option>
                    <option value="sporty">Sporty</option>
                    <option value="homewear">Homewear</option>
                    <option value="sleepwear">Sleepwear</option>
                    <option value="formal">Formal</option>
                  </select>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-emerald-300/80">Private</span>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[13%] flex items-end justify-center overflow-hidden">
                <img src="/rin/rin-default.svg" alt="Illustrated portrait of Rin, with long dark hair, a light front streak and round gold glasses" data-expression={characterExpression} data-outfit={characterOutfit} className="h-full w-full select-none object-contain object-bottom opacity-95" />
              </div>
              <div className="relative z-10 mt-auto bg-gradient-to-t from-[#0b0c0f] via-[#0b0c0f]/90 to-transparent px-5 pb-5 pt-24 sm:px-7 sm:pb-7">
                <p className="max-w-md text-sm font-light leading-relaxed text-zinc-300 sm:text-base">“There you are. Take your time — we don't have to rush.”</p>
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">Character preview · Initial presentation</p>
              </div>
            </section>

            <aside className={`fixed inset-x-3 bottom-3 z-30 flex flex-col overflow-hidden rounded-[24px] border border-white/[0.12] bg-[#101013]/[0.98] p-4 shadow-[0_-12px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-[height] duration-300 lg:static lg:z-auto lg:h-auto lg:min-h-0 lg:rounded-[28px] lg:p-7 lg:shadow-none lg:backdrop-blur-none ${mobileChatOpen ? "h-[68dvh]" : "h-[72px]"}`}>
              <button type="button" onClick={() => setMobileChatOpen((open) => !open)} className="flex min-h-8 items-center justify-between text-left lg:pointer-events-none">
                <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-400">Conversation <span className="ml-2 text-zinc-600 lg:hidden">{mobileChatOpen ? "Close" : "Open chat"}</span></span>
                <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#c6a45b]" /><span className="text-zinc-500 lg:hidden">{mobileChatOpen ? "⌄" : "⌃"}</span></span>
              </button>
              <div className={`${mobileChatOpen ? "flex" : "hidden"} my-5 flex-1 space-y-4 overflow-y-auto pr-1 lg:flex`} aria-live="polite">
                {messages.length === 0 ? (
                  <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center">
                    <div className="mb-4 grid h-11 w-11 place-items-center rounded-full border border-[#c6a45b]/20 bg-[#c6a45b]/[0.06] text-lg font-light text-[#d5bd88]">R</div>
                    <h2 className="text-base font-light text-zinc-200">Hey. I'm here.</h2>
                    <p className="mt-2 max-w-xs text-xs leading-6 text-zinc-500">Tell me what's on your mind. We can talk, plan, or figure something out together.</p>
                  </div>
                ) : messages.map((message, index) => (
                  <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={message.role === "user" ? "max-w-[88%] rounded-2xl rounded-br-md bg-[#c6a45b]/15 px-4 py-3 text-sm leading-6 text-zinc-100" : "max-w-[92%] rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.035] px-4 py-3 text-sm leading-6 text-zinc-300"}>
                      {message.content}
                    </div>
                  </div>
                ))}
                {sending && <div className="flex justify-start"><div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-3 text-xs text-zinc-500">Rin is thinking…</div></div>}
                <div ref={conversationEndRef} />
              </div>
              {chatError && <p role="alert" className={`${mobileChatOpen ? "block" : "hidden"} mb-3 text-xs leading-5 text-red-400 lg:block`}>{chatError}</p>}
              <form onSubmit={sendMessage} className={`${mobileChatOpen ? "flex" : "hidden"} items-end gap-2 rounded-2xl border border-white/10 bg-black/30 p-2 focus-within:border-[#c6a45b]/40 lg:flex`}>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} maxLength={8000} placeholder="Say something to Rin…" aria-label="Message Rin" className="max-h-32 min-h-11 flex-1 resize-y bg-transparent px-3 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
                <button type="submit" disabled={!draft.trim() || sending} className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#c6a45b] text-black transition-opacity hover:opacity-90 disabled:opacity-30" aria-label="Send message">↑</button>
              </form>
              <p className={`${mobileChatOpen ? "block" : "hidden"} mt-3 text-center font-mono text-[9px] uppercase tracking-[0.17em] text-zinc-700 lg:block`}>Private · Session-bound · Lockable</p>
            </aside>
          </div>
        </div>
      )}
    </main>
  );
}
