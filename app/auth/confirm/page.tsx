"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthConfirmPage() {
  const [msg, setMsg] = useState("جاري التحقق من الرابط...");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const token_hash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type") as
          | "invite"
          | "magiclink"
          | "recovery"
          | "email_change"
          | null;

        if (!token_hash || !type) {
          setMsg("❌ رابط غير صالح. تأكد من فتح الرابط كامل.");
          return;
        }

        const { error } = await supabase.auth.verifyOtp({ token_hash, type });

        if (error) {
          setMsg(`❌ فشل التحقق: ${error.message}`);
          return;
        }

        // ✅ invite/recovery: نوديه لتعيين كلمة المرور
        if (type === "invite" || type === "recovery") {
          window.location.href = "/auth/set-password";
          return;
        }

        // ✅ magiclink وغيره: نوديه للداشبورد
        window.location.href = "/dashboard";
      } catch (e: any) {
        setMsg(`❌ Error: ${e?.message ?? e}`);
      }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 520, margin: "80px auto", padding: "0 16px" }}>
      <div
        style={{
          padding: 18,
          borderRadius: 18,
          border: "1px solid var(--card-border)",
          background: "var(--card)",
          boxShadow: "0 18px 45px rgba(0,0,0,0.35)",
          backdropFilter: "blur(10px)",
          color: "var(--foreground)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>Confirming…</h1>
        <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>{msg}</div>
      </div>
    </div>
  );
}