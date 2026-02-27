"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SetPasswordPage() {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login?error=no_session";
      }
    })();
  }, []);

  const save = async () => {
    if (!p1 || p1.length < 8) {
      setMsg("❌ كلمة المرور لازم تكون 8 أحرف أو أكثر");
      return;
    }
    if (p1 !== p2) {
      setMsg("❌ كلمتا المرور غير متطابقتين");
      return;
    }

    setLoading(true);
    setMsg("جاري حفظ كلمة المرور...");

    const { error } = await supabase.auth.updateUser({ password: p1 });

    setLoading(false);

    if (error) {
      setMsg(`❌ خطأ: ${error.message}`);
      return;
    }

    setMsg("✅ تم تعيين كلمة المرور بنجاح");
    setTimeout(() => (window.location.href = "/dashboard"), 700);
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

  const btn: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(42,168,255,0.35)",
    background:
      "linear-gradient(135deg, rgba(42,168,255,0.22) 0%, rgba(123,211,255,0.12) 55%, rgba(255,255,255,0.06) 100%)",
    color: "var(--foreground)",
    fontWeight: 900,
    width: "100%",
    opacity: loading ? 0.7 : 1,
    cursor: loading ? "not-allowed" : "pointer",
  };

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={card}>
        <h1 style={{ margin: 0, fontSize: 28 }}>
          <span style={{ color: "var(--nexus-fire)" }}>N</span>
          <span style={{ color: "var(--foreground)" }}>exus</span>{" "}
          <span style={{ color: "var(--muted)", fontSize: 14 }}>Set Password</span>
        </h1>

        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>New password</span>
            <input style={input} value={p1} onChange={(e) => setP1(e.target.value)} type="password" placeholder="********" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>Confirm password</span>
            <input style={input} value={p2} onChange={(e) => setP2(e.target.value)} type="password" placeholder="********" />
          </label>

          <button onClick={save} style={btn} disabled={loading}>
            Save Password
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
        </div>
      </div>
    </div>
  );
}