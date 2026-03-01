"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // لازم تفتح الصفحة من رابط الإيميل (Supabase يحط session)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setMsg("❌ افتح رابط تغيير كلمة المرور من الإيميل أول.");
      }
    })();
  }, []);

  const update = async () => {
    if (!password.trim()) {
      setMsg("❌ اكتب كلمة مرور جديدة");
      return;
    }

    setLoading(true);
    setMsg("جاري تحديث كلمة المرور...");

    const { error } = await supabase.auth.updateUser({ password: password.trim() });

    setLoading(false);

    if (error) {
      setMsg(`❌ خطأ: ${error.message}`);
      return;
    }

    setMsg("✅ تم تغيير كلمة المرور. سيتم تحويلك لصفحة الدخول...");
    setTimeout(() => {
      window.location.href = "/login";
    }, 900);
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
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "var(--foreground)",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 800,
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={card}>
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontSize: 28, letterSpacing: 0.3 }}>
            Reset Password
          </h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            أدخل كلمة مرور جديدة لحسابك
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>New Password</span>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                style={{ ...input, flex: 1 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPass ? "text" : "password"}
                placeholder="********"
                autoComplete="new-password"
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

          <button onClick={update} style={btnPrimary} disabled={loading}>
            Save New Password
          </button>

          <div
            style={{
              marginTop: 6,
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
            لازم تفتح هذه الصفحة من رابط الإيميل اللي وصلك (Reset link).
          </div>
        </div>
      </div>
    </div>
  );
}