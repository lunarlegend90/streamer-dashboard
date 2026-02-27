"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SubRow = {
  status: string | null;
  current_period_end: string | null;
};

export default function BillingPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("loading");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setMsg("جاري التحقق من الاشتراك...");

    const { data: u } = await supabase.auth.getUser();
    const user = u.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setEmail(user.email ?? "");

    const { data, error } = await supabase
      .from("subscriptions")
      .select("status,current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      setStatus("error");
      setMsg(`❌ خطأ: ${error.message}`);
      return;
    }

    const row = (data as SubRow | null) ?? null;
    const st = (row?.status ?? "inactive").toLowerCase();

    if (st === "active" || st === "trialing") {
      setStatus("active");
      setMsg("✅ اشتراكك فعال — جاري تحويلك للوحة التحكم...");
      setTimeout(() => (window.location.href = "/dashboard"), 700);
      return;
    }

    setStatus(st);
    setMsg("⚠️ اشتراكك غير فعال. اختر خطة للاشتراك.");
  };

  useEffect(() => {
    load();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div style={{ maxWidth: 980, margin: "40px auto", padding: "0 16px", fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: 0.5 }}>
            <span style={{ color: "var(--nexus-fire)" }}>N</span>
            <span style={{ color: "var(--foreground)" }}>exus</span>
          </h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Logged in as: <b style={{ color: "var(--foreground)" }}>{email || "..."}</b>
          </div>
        </div>

        <button
          onClick={signOut}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "transparent",
            color: "var(--foreground)",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Sign Out
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 14,
          border: "1px solid var(--card-border)",
          background: "var(--card)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ fontSize: 13, color: msg ? "var(--foreground)" : "var(--muted)" }}>{msg || "—"}</div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 16,
          border: "1px solid var(--card-border)",
          background: "var(--card)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          backdropFilter: "blur(10px)",
        }}
      >
        <h2 style={{ margin: "0 0 10px 0" }}>Choose a plan</h2>

        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
          المتابعات والتنبيهات تتفعل فقط للمشتركين (Active).
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)" }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Nexus Basic</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
              (الأسعار بنحددها بعد ربط Stripe)
            </div>

            <button
              disabled
              style={{
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(42,168,255,0.35)",
                background:
                  "linear-gradient(135deg, rgba(42,168,255,0.22) 0%, rgba(123,211,255,0.12) 55%, rgba(255,255,255,0.06) 100%)",
                color: "var(--foreground)",
                fontWeight: 900,
                width: "100%",
                opacity: 0.6,
                cursor: "not-allowed",
              }}
              title="سنفعّل الدفع بالخطوة القادمة"
            >
              Subscribe (coming next)
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, color: "var(--muted)", fontSize: 12 }}>
          Status الآن: <b style={{ color: "var(--foreground)" }}>{status}</b>
        </div>
      </div>
    </div>
  );
}