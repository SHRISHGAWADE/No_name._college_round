"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

export function AuthGate({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  if (!supabase) return children;
  if (loading) return <main className="auth-shell"><div className="auth-card"><Sparkles/><p>Checking your session…</p></div></main>;
  if (session) return children;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = mode === "sign_in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (mode === "sign_up" && !result.data.session) setMessage("Account created. Check your email to confirm it, then sign in.");
      else setMessage("Signed in successfully.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not complete sign-in. Try again.");
    } finally { setBusy(false); }
  };

  return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><span><Sparkles size={19}/></span><strong>Second Opinion</strong></div>
    <span className="eyebrow"><LockKeyhole size={13}/> PRIVATE AUDIT WORKSPACE</span>
    <h1>{mode === "sign_in" ? "Welcome back." : "Create your account."}</h1>
    <p>Your audits and source documents are saved to your private workspace.</p>
    <form onSubmit={(event) => void submit(event)}>
      <label>Email<input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"/></label>
      <label>Password<input autoComplete={mode === "sign_in" ? "current-password" : "new-password"} type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters"/></label>
      <button className="primary-button" disabled={busy}>{busy ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}<ArrowRight size={15}/></button>
    </form>
    {message && <p className="auth-message" role="status">{message}</p>}
    <button className="auth-mode-button" onClick={() => { setMode(mode === "sign_in" ? "sign_up" : "sign_in"); setMessage(""); }}>
      {mode === "sign_in" ? "New to Second Opinion? Create an account" : "Already have an account? Sign in"}
    </button>
  </section></main>;
}
