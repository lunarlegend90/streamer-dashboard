"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const DISCORD_INVITE_URL = "https://discord.gg/PqCMCgH7";

// Keys used by supabase-js in storage
const SB_STORAGE_KEY = "sb-" + (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")?.replace(/^https?:\/\//, "").replace(/\W+/g, "") + "-auth-token";
const REMEMBER_KEY = "nexus_remember_me";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ Remember me + show password
  const [rememberMe, setRememberMe] = useState(true);
  const [showPass, setShowPass] = useState(false);

  // Load remember preference + handle existing session
  useEffect(() => {
    try {
      const v = localStorage.getItem(REMEMBER_KEY);
      if (v === "0") setRememberMe(false);
      if (v === "1") setRememberMe(true);
    } catch {
      // ignore
    }

    (async () => {
      // If user already logged in → go dashboard
      const { data } = await supabase.auth.getUser();
      if (data.user) window.location.href = "/dashboard";
    })();
  }, []);

  const persistSessionBasedOnRemember = async () => {
    // After login, Supabase is usually persisted in localStorage.
    // If rememberMe=false → move token to sessionStorage and clear localStorage copy.
    try {
      // Try to detect the actual storage key in localStorage (supabase may name it differently)
      const keys = Object.keys(localStorage);
      const sbKey =
        keys.find((k) => k.includes("supabase") && k.includes("auth-token")) ||
        keys.find((k) => k.endsWith("-auth-token")) ||
        SB_STORAGE_KEY;

      const tokenStr = localStorage.getItem(sbKey);
      if (!tokenStr) return;

      if (!rememberMe) {
        sessionStorage.setItem(sbKey, tokenStr);
        localStorage.removeItem(sbKey);
      } else {
        // Ensure it stays in localStorage
        // (Optional) remove any sessionStorage copy to avoid confusion
        sessionStorage.removeItem(sbKey);
      }
    } catch {
      // ignore
    }
  };

  const signIn = async () => {
    if (!email || !password) {
      setMsg("❌ أدخل الإيميل والباسورد");
      return;
    }
    setLoading(true);
    setMsg("جاري تسجيل الدخول...");

    // Save remember preference
    try {
      localStorage.setItem(REMEMBER_KEY, rememberMe ? "1" : "0");
    } catch {}

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      setMsg(`❌ خطأ: ${error.message}`);
      return;
    }

    // Apply remember/session-only behavior
    await persistSessionBasedOnRemember();

    setLoading(false);
    setMsg("✅ تم تسجيل الدخول");
    window.location.href = "/dashboard";
  };

  const requestAccess = () => {
    window.open(DISCORD_INVITE_URL, "_blank", "noopener,noreferrer");
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

  const btnDiscord: React.CSSProperties = {
    ...btnBase,
    border: "1px solid rgba(255,106,0,0.35)",
    background:
      "linear-gradient(135deg, rgba(255,106,0,0.22) 0%, rgba(255,177,74,0.10) 60%, rgba(255,255,255,0.06) 100%)",
    boxShadow: "0 0 0 1px rgba(255,106,0,0.10), 0 12px 30px rgba(255,106,0,0.10)",
  };

  const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 };

  const smallBtn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "var(--foreground)",
    cursor: "pointer",
    fontWeight: 800,
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={card}>
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: 0.5 }}>
            <span style={{ color: "var(--nexus-fire)" }}>N</span>
            <span style={{ color: "var(--foreground)" }}>exus</span>
          </h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Sign in to access your dashboard</div>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
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

            <div style={row}>
              <input
                style={{ ...input, marginTop: 0 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPass ? "text" : "password"}
                placeholder="********"
                autoComplete="current-password"
                disabled={loading}
              />

              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                style={smallBtn}
                disabled={loading}
                title="Show/Hide password"
              >
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {/* ✅ Remember me */}
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

          <button onClick={signIn} style={btnPrimary} disabled={loading}>
            Sign In
          </button>

          <button onClick={requestAccess} style={btnDiscord} disabled={loading}>
            Request Access (Discord)
          </button>

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
            التسجيل مغلق — اضغط <b>Request Access</b> واطلب التفعيل عبر الديسكورد.
          </div>
        </div>
      </div>
    </div>
  );
}