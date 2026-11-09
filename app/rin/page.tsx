'use client';

import { useEffect, useState } from "react";
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

  async function lock() {
    if (locking) return;
    setLocking(true);
    try {
      await fetch("/api/rin/session", { method: "DELETE" });
    } finally {
      setUnlocked(false);
      setPin("");
      setLocking(false);
    }
  }

  if (checking) {
    return <main className="min-h-[100dvh] bg-[#080808] text-zinc-500 grid place-items-center font-mono text-xs tracking-[0.2em]">ESTABLISHING PRIVATE SESSION…</main>;
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#080808] text-zinc-100 selection:bg-[#c9a85d]/30">
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
            <section className="relative isolate flex min-h-[66dvh] flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#111115] lg:min-h-0">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,rgba(163,137,86,0.17),transparent_55%),linear-gradient(180deg,#17171b_0%,#0d0e11_100%)]" />
              <div className="relative z-10 flex items-start justify-between px-5 pt-5 sm:px-7 sm:pt-7">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-500">Your companion</p>
                  <h1 className="mt-1 text-2xl font-light tracking-tight sm:text-3xl">Rin</h1>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-emerald-300/80">Private session</span>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[13%] flex items-end justify-center overflow-hidden">
                <img src="/rin/rin-default.svg" alt="Illustrated portrait of Rin, with long dark hair, a light front streak and round gold glasses" className="h-full w-full select-none object-contain object-bottom opacity-95" />
              </div>
              <div className="relative z-10 mt-auto bg-gradient-to-t from-[#0b0c0f] via-[#0b0c0f]/90 to-transparent px-5 pb-5 pt-24 sm:px-7 sm:pb-7">
                <p className="max-w-md text-sm font-light leading-relaxed text-zinc-300 sm:text-base">“There you are. Take your time — we don't have to rush.”</p>
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">Character preview · Initial presentation</p>
              </div>
            </section>

            <aside className="flex min-h-[270px] flex-col rounded-[28px] border border-white/[0.08] bg-[#101013] p-5 sm:p-7 lg:min-h-0">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-500">Conversation</p>
                <span className="h-1.5 w-1.5 rounded-full bg-[#c6a45b]" />
              </div>
              <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-full border border-[#c6a45b]/20 bg-[#c6a45b]/[0.06] text-lg font-light text-[#d5bd88]">R</div>
                <h2 className="text-lg font-light text-zinc-200">A space for the two of you</h2>
                <p className="mt-2 max-w-xs text-xs leading-6 text-zinc-500">Rin’s private conversation is the next stage. Her memory will be kept separate from Espresso’s main assistant.</p>
                <span className="mt-5 rounded-full border border-white/[0.08] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Conversation not connected yet</span>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-black/30 px-4 py-3 text-xs text-zinc-600">Your private conversation will appear here.</div>
              <p className="mt-4 text-center font-mono text-[9px] uppercase tracking-[0.17em] text-zinc-700">Private · Session-bound · Lockable</p>
            </aside>
          </div>
        </div>
      )}
    </main>
  );
}
