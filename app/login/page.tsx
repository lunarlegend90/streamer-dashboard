"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const REMEMBER_KEY = "nexus_remember_me";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [rememberMe, setRememberMe] = useState(true);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(REMEMBER_KEY);
      if (v === "0") setRememberMe(false);
      if (v === "1") setRememberMe(true);
    } catch {}

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) window.location.href = "/dashboard";
    })();
  }, []);

  const persistRememberPref = () => {
    try {
      localStorage.setItem(REMEMBER_KEY, rememberMe ? "1" : "0");
    } catch {}
  };

  const signIn = async () => {
    if (!email || !password) {
      setMsg("❌ أدخل الإيميل والباسورد");
      return;
    }

    persistRememberPref();

    setLoading(true);
    setMsg("جاري تسجيل الدخول...");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      setMsg(`❌ خطأ: ${error.message}`);
      return;
    }

    // ✅ check approval before redirect
    const { data: u } = await supabase.auth.getUser();
    const me = u.user;

    if (me?.id) {
      const { data: prof } = await supabase.from("profiles").select("is_approved").eq("id", me.id).maybeSingle();
      if (!prof?.is_approved) {
        await supabase.auth.signOut();
        setLoading(false);
        setMsg("⏳ حسابك بانتظار موافقة الإدارة. حاول لاحقًا.");
        return;
      }
    }

    setLoading(false);
    setMsg("✅ تم تسجيل الدخول");
    window.location.href = "/dashboard";
  };

  const signUp = async () => {
    if (!email || !password) {
      setMsg("❌ أدخل الإيميل والباسورد");
      return;
    }

    persistRememberPref();

    setLoading(true);
    setMsg("جاري إنشاء الحساب...");

    const { error } = await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setMsg(`❌ خطأ: ${error.message}`);
      return;
    }

    // user created but pending approval
    setMsg("✅ تم إنشاء الحساب. ⏳ بانتظار موافقة الإدارة.");
    setMode("signin");
  };

  const card: React.CSSProperties = {
    maxWidth: 460,
    margin: "80px auto",
    padding: 18,
    borderRadius: 18,
    border: "1px solid var(--card-border)",
    background: "var(--card)",
    boxShadow: "0 18px 45px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    marginTop: 6,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "var(--foreground)",
    outline: "none",
  };

  const btnBase: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "var(--foreground)",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 800,
    width: "100%",
    opacity: loading ? 0.7 : 1,
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    border: "1px solid rgba(42,168,255,0.35)",
    background:
      "linear-gradient(135deg, rgba(42,168,255,0.22) 0%, rgba(123,211,255,0.12) 55%, rgba(255,255,255,0.06) 100%)",
    boxShadow: "0 0 0 1px rgba(42,168,255,0.10), 0 12px 30px rgba(42,168,255,0.10)",
  };

  const btnSecondary: React.CSSProperties = {
    ...btnBase,
    width: "auto",
    padding: "10px 12px",
  };

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={card}>
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: 0.5 }}>
            <span style={{ color: "var(--nexus-fire)" }}>N</span>
            <span style={{ color: "var(--foreground)" }}>exus</span>
          </h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            {mode === "signin" ? "Sign in to access your dashboard" : "Create an account (Pending approval)"}
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              style={mode === "signin" ? btnPrimary : btnSecondary}
              onClick={() => setMode("signin")}
              disabled={loading}
            >
              Sign In
            </button>
            <button
              style={mode === "signup" ? btnPrimary : btnSecondary}
              onClick={() => setMode("signup")}
              disabled={loading}
            >
              Sign Up
            </button>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>Email</span>
            <input
              style={input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              inputMode="email"
              autoComplete="email"
              disabled={loading}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>Password</span>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                style={{ ...input, marginTop: 0, flex: 1 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPass ? "text" : "password"}
                placeholder="********"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                disabled={loading}
              />

              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                style={btnSecondary}
                disabled={loading}
              >
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={loading}
              style={{ transform: "scale(1.05)" }}
            />
            <span style={{ color: "var(--foreground)", fontSize: 13, fontWeight: 800 }}>
              Remember me (حفظ الحساب)
            </span>
          </label>

          {mode === "signin" ? (
            <button onClick={signIn} style={btnPrimary} disabled={loading}>
              Sign In
            </button>
          ) : (
            <button onClick={signUp} style={btnPrimary} disabled={loading}>
              Create Account
            </button>
          )}

          <div
            style={{
              marginTop: 8,
              padding: 10,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: msg ? "var(--foreground)" : "var(--muted)",
              fontSize: 13,
              minHeight: 42,
              display: "flex",
              alignItems: "center",
            }}
          >
            {msg || "—"}
          </div>

          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
            {mode === "signup"
              ? "بعد إنشاء الحساب، لازم موافقة الإدارة قبل الدخول."
              : "إذا حسابك جديد، سجّل Sign Up ثم انتظر الموافقة."}
          </div>
        </div>
      </div>
    </div>
  );
}