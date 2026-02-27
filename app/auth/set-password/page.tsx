"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMsg("جلسة الدخول غير موجودة. افتح رابط الدعوة مرة ثانية.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) setMsg(error.message);
    else setMsg("تم تعيين كلمة المرور بنجاح ✅");
  };

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>تعيين كلمة المرور</h1>
      <form onSubmit={onSubmit}>
        <input
          type="password"
          placeholder="كلمة مرور جديدة"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 12, marginTop: 12 }}
        />
        <button disabled={loading} style={{ width: "100%", padding: 12, marginTop: 12 }}>
          {loading ? "جاري الحفظ..." : "حفظ"}
        </button>
      </form>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  );
}