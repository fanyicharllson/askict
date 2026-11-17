"use client";

import { LockKeyholeIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LogoMark } from "./logo";

export type SessionUser = { id: string; identifier: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onSignedIn: (user: SessionUser) => void;
};

export function SignInDialog({ open, onClose, onSignedIn }: Props) {
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPin("");
    setTimeout(() => first.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not sign in.");
      onSignedIn(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="signin-title">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          aria-label="Close"
        >
          <XIcon className="size-4" />
        </button>
        <LogoMark className="size-10" />
        <h2 id="signin-title" className="mt-4 text-xl font-bold text-ink">
          Save your chats
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with your email or phone number and a 4-digit PIN. First time? This creates your account.
        </p>

        <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="identifier">
          Email or phone number
        </label>
        <input
          ref={first}
          id="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="you@example.com or 677 12 34 56"
          autoComplete="username"
          className="mt-1.5 h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] outline-none focus:border-brand focus:ring-3 focus:ring-brand/15"
          required
        />

        <label className="mt-4 block text-sm font-semibold text-ink" htmlFor="pin">
          4-digit PIN
        </label>
        <input
          id="pin"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          type="password"
          autoComplete="current-password"
          placeholder="••••"
          className="mt-1.5 h-11 w-full rounded-xl border bg-white px-3.5 text-lg tracking-[0.5em] outline-none focus:border-brand focus:ring-3 focus:ring-brand/15"
          required
          minLength={4}
        />

        {error && <p className="mt-3 rounded-lg bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading || pin.length !== 4 || !identifier.trim()}
          className="mt-5 h-11 w-full rounded-xl bg-brand font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
        >
          {loading ? "Signing in…" : "Continue"}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <LockKeyholeIcon className="size-3" /> No code is sent. Don&apos;t reuse your bank PIN.
        </p>
      </form>
    </div>
  );
}
