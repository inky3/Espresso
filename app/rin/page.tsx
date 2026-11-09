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
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
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
    await fetch("/api/rin/session", { method: "DELETE" });
    setUnlocked(false);
    setPin("");
  }

  if (checking) {
    return <main className="min-h-screen bg-[#080808] text-zinc-500 grid place-items-center font-mono text-xs tracking-[0.2em]">ESTABLISHING PRIVATE SESSION…</main>;
  }

  return (
    <main className="min-h-screen bg-[#080808] text-zinc-100 flex items-center justify-center px-5 py-10">
      <section className="w-full max-w-md">
        <p className="text-[10px] font-mono tracking-[0.3em] uppercase text-[#D4AF37]/70 mb-4">Espresso / Private Space</p>
        {unlocked ? (
          <div className="border border-white/10 rounded-2xl bg-[#101010] p-7 sm:p-9">
            <p className="text-xs font-mono uppercase tracking-[0.25em] text-emerald-400 mb-3">Private session active</p>
            <h1 className="text-3xl font-light tracking-tight">Rin</h1>
            <p className="text-sm text-zinc-400 leading-relaxed mt-4">The private access layer is active. Character presentation and conversation are the next implementation stage.</p>
            <button onClick={lock} className="mt-8 w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300 hover:bg-white/5 transition-colors">Lock private space</button>
          </div>
        ) : (
          <form onSubmit={unlock} className="border border-white/10 rounded-2xl bg-[#101010] p-7 sm:p-9">
            <h1 className="text-3xl font-light tracking-tight">Rin</h1>
            <p className="text-sm text-zinc-500 mt-2 mb-8">Enter your private access PIN to continue.</p>
            <label htmlFor="rin-pin" className="block text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-2">Access PIN</label>
            <input id="rin-pin" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} className="w-full rounded-xl bg-black border border-white/10 px-4 py-3 text-lg tracking-[0.35em] outline-none focus:border-[#D4AF37]/60" />
            {error && <p role="alert" className="text-sm text-red-400 mt-3">{error}</p>}
            <button disabled={!pin || busy} className="mt-5 w-full rounded-xl bg-[#D4AF37] text-black px-4 py-3 text-sm font-medium disabled:opacity-40">{busy ? "Checking…" : "Unlock Rin"}</button>
          </form>
        )}
        <p className="text-center text-[10px] text-zinc-700 font-mono mt-6">PRIVATE · SESSION-BOUND · LOCKABLE</p>
      </section>
    </main>
  );
}
