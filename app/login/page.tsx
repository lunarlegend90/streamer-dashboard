"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const signUp = async () => {
    setMsg("جاري إنشاء الحساب...");
    const { error } = await supabase.auth.signUp({ email, password });
    setMsg(error ? `خطأ: ${error.message}` : "تم إنشاء الحساب ✅ (قد تحتاج تأكيد من الإيميل)");
  };

  const signIn = async () => {
    setMsg("جاري تسجيل الدخول...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMsg(error ? `خطأ: ${error.message}` : "تم تسجيل الدخول ✅");
  };

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", fontFamily: "sans-serif" }}>
      <h1>Login</h1>

      <label>Email</label>
      <input
        style={{ width: "100%", padding: 10, margin: "8px 0" }}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
      />

      <label>Password</label>
      <input
        style={{ width: "100%", padding: 10, margin: "8px 0" }}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        placeholder="********"
      />

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button onClick={signIn} style={{ padding: 10, flex: 1 }}>Sign In</button>
        <button onClick={signUp} style={{ padding: 10, flex: 1 }}>Sign Up</button>
      </div>

      <p style={{ marginTop: 16 }}>{msg}</p>
    </div>
  );
}