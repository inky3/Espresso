'use client';

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  onIdTokenChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import { auth } from "@/lib/firebase";

type Status = "loading" | "signin" | "owner" | "denied" | "error";

function errorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}

/**
 * Signs in with Google before anything else is shown, and lets only the owner
 * (checked on the server against OWNER_EMAILS) through. An existing anonymous
 * account is linked rather than replaced, so its saved data and Rin's memory
 * stay with the same user ID.
 */
export default function OwnerGate({
  space,
  title,
  children,
}: {
  space: "espresso" | "rin";
  title: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  const check = useCallback(async (user: User | null) => {
    if (!user) return;
    if (user.isAnonymous) {
      setStatus("signin");
      return;
    }
    setStatus("loading");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/owner?space=${space}`, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.owner) return setStatus("owner");
      if (data.code === "sign_in_required") return setStatus("signin");
      setMessage(typeof data.error === "string" ? data.error : "Access could not be verified.");
      setStatus(data.code === "not_owner" ? "denied" : "error");
    } catch {
      setMessage("Could not reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }, [space]);

  useEffect(() => {
    getRedirectResult(auth).catch(async (error: unknown) => {
      if (errorCode(error) === "auth/credential-already-in-use") {
        const credential = GoogleAuthProvider.credentialFromError(error as FirebaseError);
        if (credential) await signInWithCredential(auth, credential).catch(() => undefined);
      }
    });
    const unsubscribe = onIdTokenChanged(auth, (user) => {
      if (!user) {
        // Keep an anonymous session so a first Google sign-in links to it (preserving saved data).
        signInAnonymously(auth).catch(() => {
          setMessage("Could not start a secure session. Please reload.");
          setStatus("error");
        });
        return;
      }
      void check(user);
    });
    return unsubscribe;
  }, [check]);

  async function continueWithGoogle() {
    setWorking(true);
    setMessage("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const current = auth.currentUser;
    try {
      if (current?.isAnonymous) await linkWithPopup(current, provider);
      else await signInWithPopup(auth, provider);
      await check(auth.currentUser);
    } catch (error) {
      const code = errorCode(error);
      if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        // This Google account already exists (e.g. signed in on another device): just sign in to it.
        const credential = GoogleAuthProvider.credentialFromError(error as FirebaseError);
        if (credential) {
          await signInWithCredential(auth, credential);
          await check(auth.currentUser);
        }
      } else if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        if (current?.isAnonymous) await linkWithRedirect(current, provider);
        else await signInWithRedirect(auth, provider);
      } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setMessage("Google sign-in failed. Please try again.");
      }
    } finally {
      setWorking(false);
    }
  }

  if (status === "owner") return <>{children}</>;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b0908] px-6 text-zinc-200">
      <div className="w-full max-w-sm text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.42em] text-[#b8925a]">{title}</p>

        {status === "loading" && <p className="mt-8 text-sm text-zinc-500">Checking access…</p>}

        {status === "signin" && (
          <>
            <h1 className="mt-6 text-2xl font-light text-zinc-100">Private access</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-500">Sign in with the owner&apos;s Google account to continue.</p>
            <button
              type="button"
              onClick={continueWithGoogle}
              disabled={working}
              className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-full border border-[#b8925a]/40 bg-[#17110d] px-5 py-3 text-sm text-zinc-100 transition hover:border-[#b8925a]/70 disabled:opacity-60"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
                <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
              </svg>
              {working ? "Signing in…" : "Continue with Google"}
            </button>
            {message && <p className="mt-4 text-xs text-rose-300/80">{message}</p>}
          </>
        )}

        {status === "denied" && (
          <>
            <h1 className="mt-6 text-2xl font-light leading-snug text-zinc-100">{message}</h1>
            <button type="button" onClick={() => void signOut(auth)} className="mt-8 text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300">
              Sign out
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <p className="mt-6 text-sm leading-6 text-zinc-400">{message}</p>
            <button type="button" onClick={() => void check(auth.currentUser)} className="mt-6 text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300">
              Try again
            </button>
          </>
        )}
      </div>
    </main>
  );
}
