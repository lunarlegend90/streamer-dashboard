"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Streamer = {
  id: string;
  platform: string;
  username: string;
  display_name: string | null;
  channel_url: string;
  last_status: string;
};

type PendingNotif = {
  id: number;
  streamer_id: string;
  created_at: string;
  status: "pending" | "opened" | "dismissed";
  streamers: {
    id: string;
    platform: string;
    username: string;
    display_name: string | null;
    channel_url: string;
    last_status: string;
  };
};

export default function DashboardPage() {
  const [email, setEmail] = useState<string>("");
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [platform, setPlatform] = useState("kick");
const [username, setUsername] = useState("");
const [displayName, setDisplayName] = useState("");
const [channelUrl, setChannelUrl] = useState("");
const [pending, setPending] = useState<PendingNotif[]>([]);

  const load = async (silent = false) => {
  if (!silent) setMsg("جاري تحميل البيانات...");

  const { data: userData } = await supabase.auth.getUser();
  const userEmail = userData.user?.email ?? "";
  setEmail(userEmail);

  const { data, error } = await supabase
    .from("streamers")
    .select("id, platform, username, display_name, channel_url, last_status")
    .order("created_at", { ascending: false });

  if (error) {
    if (!silent) setMsg(`خطأ: ${error.message}`);
    return;
  }

  setStreamers((data as any) ?? []);
  if (!silent) setMsg("✅ تم التحميل");
};

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

 const refreshStatus = async () => {
  setMsg("جاري تحديث الحالات...");

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMsg("❌ لا يوجد تسجيل دخول. ارجع لصفحة login.");
      return;
    }

    const res = await fetch("/api/refresh-status", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      setMsg(`❌ خطأ: ${data.error ?? "Unknown error"}`);
      return;
    }

    setMsg(`✅ تم تحديث الحالات (${data.updated}/${data.checked})`);
  } catch (e: any) {
    setMsg(`❌ Error: ${e?.message ?? e}`);
  }

  load(true); // تحديث القائمة بدون تخريب الرسالة

};

const loadPending = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    setPending([]);
    return;
  }

  const res = await fetch("/api/auto-open/pending", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (data.ok) setPending(data.items ?? []);
};

const openNow = async (n: PendingNotif) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    setMsg("❌ لا يوجد تسجيل دخول. ارجع لصفحة login.");
    return;
  }

  // افتح القناة
  window.open(n.streamers.channel_url, "_blank", "noopener,noreferrer");

  // سجل opened + cooldown
  await fetch("/api/auto-open/mark-opened", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ notificationId: n.id, streamerId: n.streamer_id }),
  });

  await loadPending();
};

  const addStreamer = async () => {
  setMsg("جاري الإضافة...");
  if (!username.trim() || !channelUrl.trim()) {
    setMsg("الرجاء إدخال username و channel URL");
    return;
  }

  let finalUsername = username.trim();

  // إذا المستخدم لصق رابط في خانة URL نطلع الـ slug منه
  try {
    const u = new URL(channelUrl.trim());
    const slug = u.pathname.replace("/", "").trim();
    if (slug) finalUsername = slug;
  } catch {}

  // Kick: نخليه lowercase
  if (platform === "kick" || platform === "twitch") finalUsername = finalUsername.toLowerCase();
  
  const { error } = await supabase.from("streamers").insert({
    platform,
    username: finalUsername,
    display_name: displayName.trim() || null,
    channel_url: channelUrl.trim(),
    is_enabled: true,
    last_status: "unknown",
  });

  if (error) {
    setMsg(`خطأ: ${error.message}`);
    return;
  }

  setUsername("");
  setDisplayName("");
  setChannelUrl("");
  setMsg("✅ تمت إضافة الستريمر");
  load();
};

  useEffect(() => {
  load();
  loadPending();

  const t = setInterval(() => {
    loadPending();
  }, 15000);

  return () => clearInterval(t);
}, []);

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Dashboard</h1>
        <button onClick={signOut} style={{ padding: 10 }}>Sign Out</button>
      </div>

      <p>Logged in as: <b>{email || "..."}</b></p>
      <p>{msg}</p>
      <div style={{ marginTop: 10, padding: 10, border: "1px solid #555", borderRadius: 8 }}>
  {msg || "—"}
</div>

{pending.length > 0 && (
  <div style={{ border: "1px solid #333", borderRadius: 12, padding: 12, marginTop: 16 }}>
    <h2>New Live Streams</h2>

    <div style={{ display: "grid", gap: 10 }}>
      {pending.map((n) => (
        <div key={n.id} style={{ border: "1px solid #444", borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <b>{n.streamers.display_name ?? n.streamers.username}</b> ({n.streamers.platform})
              <br />
              Status: <b>{n.streamers.last_status}</b>
            </div>

            <button onClick={() => openNow(n)} style={{ padding: 10 }}>
              Open
            </button>
          </div>

          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 12 }}>
            queued at: {new Date(n.created_at).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  </div>
)}

      <div style={{ border: "1px solid #333", borderRadius: 12, padding: 12, marginTop: 16 }}>
  <h2>Add Streamer</h2>

  <div style={{ display: "grid", gap: 8 }}>
    <label>
      Platform
      <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ width: "100%", padding: 10, marginTop: 4 }}>
        <option value="kick">kick</option>
        <option value="twitch">twitch</option>
        <option value="youtube">youtube</option>
      </select>
    </label>

    <label>
      Username (required)
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 4 }}
        placeholder="مثال: nofear"
      />
    </label>

    <label>
      Display Name (optional)
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 4 }}
        placeholder="مثال: NOFEAR"
      />
    </label>

    <label>
      Channel URL (required)
      <input
        value={channelUrl}
        onChange={(e) => setChannelUrl(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 4 }}
        placeholder="https://kick.com/..."
      />
    </label>

  

    <button onClick={addStreamer} style={{ padding: 12 }}>
      Add
    </button>

    <button onClick={refreshStatus} style={{ padding: 10, marginTop: 10 }}>
  Refresh Status
</button>
  </div>
</div>
      <h2>Streamers</h2>
      {streamers.length === 0 ? (
        <p>لا يوجد ستريمرات الآن. (بنضيفهم في المرحلة الجاية)</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {streamers.map((s) => (
            <div key={s.id} style={{ border: "1px solid #333", borderRadius: 10, padding: 12 }}>
              <div><b>{s.display_name ?? s.username}</b> ({s.platform})</div>
              <div>Status: <b>{s.last_status}</b></div>
              <a href={s.channel_url} target="_blank" rel="noreferrer">Open Channel</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}