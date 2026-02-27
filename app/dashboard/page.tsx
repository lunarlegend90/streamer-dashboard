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
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "unknown">("all");

  // ✅ UI extras
  const [search, setSearch] = useState("");

  // Auto-open settings
  const [autoOpenEnabled, setAutoOpenEnabled] = useState<boolean>(true);
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(30);

  const normalizeStatus = (s: string) => (s ?? "unknown").toLowerCase();
  const statusRank: Record<string, number> = { online: 0, offline: 1, unknown: 2 };

  const statusBadge = (st: string) => {
    const s = (st ?? "unknown").toLowerCase();
    const base: React.CSSProperties = {
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 999,
      fontSize: 12,
      border: "1px solid #444",
      fontWeight: 700,
    };

    if (s === "online") return <span style={{ ...base, background: "#00ff66", color: "#000" }}>ONLINE</span>;
    if (s === "offline") return <span style={{ ...base, background: "#bbbbbb", color: "#000" }}>OFFLINE</span>;
    return <span style={{ ...base, background: "#ffee00", color: "#000" }}>UNKNOWN</span>;
  };

  const load = async (silent = false) => {
    if (!silent) setMsg("جاري تحميل البيانات...");

    const { data: userData } = await supabase.auth.getUser();
    setEmail(userData.user?.email ?? "");

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

    if (!res.ok || !data.ok) {
      setMsg(`❌ pending error: ${data.error ?? res.status}`);
      setPending([]);
      return;
    }

    setPending(data.items ?? []);
  };

  const openNow = async (n: PendingNotif) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMsg("❌ لا يوجد تسجيل دخول. ارجع لصفحة login.");
      return;
    }

    window.open(n.streamers.channel_url, "_blank", "noopener,noreferrer");

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

  const dismissNow = async (n: PendingNotif) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMsg("❌ لا يوجد تسجيل دخول. ارجع لصفحة login.");
      return;
    }

    const res = await fetch("/api/auto-open/mark-dismissed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notificationId: n.id }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      setMsg(`❌ Dismiss error: ${data.error ?? res.status}`);
      return;
    }

    await loadPending();
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

    load(true);
    loadPending();
  };

  const deleteStreamer = async (id: string) => {
    if (!confirm("حذف الستريمر؟")) return;

    const { error } = await supabase.from("streamers").delete().eq("id", id);

    if (error) {
      setMsg(`❌ خطأ حذف: ${error.message}`);
      return;
    }

    setMsg("✅ تم حذف الستريمر");
    load(true);
    loadPending();
  };

  const addStreamer = async () => {
    setMsg("جاري الإضافة...");
    if (!username.trim() || !channelUrl.trim()) {
      setMsg("الرجاء إدخال username و channel URL");
      return;
    }

    let finalUsername = username.trim();

    try {
      const u = new URL(channelUrl.trim());
      const slug = u.pathname.replace("/", "").trim();
      if (slug) finalUsername = slug;
    } catch {}

    if (platform === "kick" || platform === "twitch") finalUsername = finalUsername.toLowerCase();

    const exists = streamers.some(
      (s) =>
        (s.platform ?? "").toLowerCase() === platform.toLowerCase() &&
        (s.username ?? "").toLowerCase() === finalUsername.toLowerCase()
    );
    if (exists) {
      setMsg("⚠️ هذا الستريمر موجود مسبقًا.");
      return;
    }

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
    loadPending();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const loadAutoOpenSettings = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    const res = await fetch("/api/settings/auto-open", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      setAutoOpenEnabled(Boolean(data.auto_open_enabled));
      setCooldownMinutes(Number(data.auto_open_cooldown_minutes ?? 0));
    }
  };

  const saveAutoOpenSettings = async () => {
    setMsg("جاري حفظ الإعدادات...");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMsg("❌ لا يوجد تسجيل دخول.");
      return;
    }

    const res = await fetch("/api/settings/auto-open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        auto_open_enabled: autoOpenEnabled,
        auto_open_cooldown_minutes: cooldownMinutes,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      setMsg(`❌ خطأ حفظ الإعدادات: ${data.error ?? res.status}`);
      return;
    }

    setMsg("✅ تم حفظ الإعدادات");
  };

  // ✅ Realtime: open_notifications + streamers
  useEffect(() => {
    load();
    loadPending();
    loadAutoOpenSettings();

    const notifsChannel = supabase
      .channel("open_notifications_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "open_notifications" }, () => {
        loadPending();
      })
      .subscribe();

    const streamersChannel = supabase
      .channel("streamers_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "streamers" }, () => {
        load(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(notifsChannel);
      supabase.removeChannel(streamersChannel);
    };
  }, []);

  const q = search.trim().toLowerCase();

  const visibleStreamers = streamers
    .filter((s) => {
      const st = normalizeStatus(s.last_status);
      const passStatus = statusFilter === "all" ? true : st === statusFilter;

      const name = (s.display_name ?? s.username ?? "").toLowerCase();
      const passSearch = q ? name.includes(q) || (s.username ?? "").toLowerCase().includes(q) : true;

      return passStatus && passSearch;
    })
    .sort((a, b) => {
      const ra = statusRank[normalizeStatus(a.last_status)] ?? 9;
      const rb = statusRank[normalizeStatus(b.last_status)] ?? 9;
      if (ra !== rb) return ra - rb;
      return (a.display_name ?? a.username).localeCompare(b.display_name ?? b.username);
    });

  const countOnline = streamers.filter((s) => normalizeStatus(s.last_status) === "online").length;
  const countOffline = streamers.filter((s) => normalizeStatus(s.last_status) === "offline").length;
  const countUnknown = streamers.filter((s) => normalizeStatus(s.last_status) === "unknown").length;

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Dashboard</h1>
        <button onClick={signOut} style={{ padding: 10 }}>
          Sign Out
        </button>
      </div>

      <p>
        Logged in as: <b>{email || "..."}</b>
      </p>

      <div style={{ marginTop: 10, padding: 10, border: "1px solid #555", borderRadius: 8 }}>{msg || "—"}</div>

      <div style={{ border: "1px solid #333", borderRadius: 12, padding: 12, marginTop: 16 }}>
        <h2>Auto-Open Settings</h2>

        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <input
            type="checkbox"
            checked={autoOpenEnabled}
            onChange={(e) => setAutoOpenEnabled(e.target.checked)}
          />
          Enable Auto-Open notifications
        </label>

        <div style={{ marginTop: 10 }}>
          <label>
            Cooldown (minutes)
            <input
              type="number"
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(Number(e.target.value))}
              style={{ width: "100%", padding: 10, marginTop: 4 }}
              min={0}
              max={1440}
            />
          </label>
        </div>

        <button onClick={saveAutoOpenSettings} style={{ padding: 10, marginTop: 12 }}>
          Save Settings
        </button>
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
                    Status: {statusBadge(n.streamers.last_status)}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openNow(n)} style={{ padding: 10 }}>
                      Open
                    </button>
                    <button onClick={() => dismissNow(n)} style={{ padding: 10 }}>
                      Dismiss
                    </button>
                  </div>
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
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 4 }}
            >
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

      <h2 style={{ marginTop: 20 }}>Streamers</h2>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name/username..."
          style={{ padding: 10, minWidth: 260, borderRadius: 8, border: "1px solid #444" }}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ padding: "6px 10px", border: "1px solid #444", borderRadius: 8 }}>
            Online: <b>{countOnline}</b>
          </span>
          <span style={{ padding: "6px 10px", border: "1px solid #444", borderRadius: 8 }}>
            Offline: <b>{countOffline}</b>
          </span>
          <span style={{ padding: "6px 10px", border: "1px solid #444", borderRadius: 8 }}>
            Unknown: <b>{countUnknown}</b>
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 8 }}>
        <button onClick={() => setStatusFilter("all")} style={{ padding: 8 }}>
          All
        </button>
        <button onClick={() => setStatusFilter("online")} style={{ padding: 8 }}>
          Online
        </button>
        <button onClick={() => setStatusFilter("offline")} style={{ padding: 8 }}>
          Offline
        </button>
        <button onClick={() => setStatusFilter("unknown")} style={{ padding: 8 }}>
          Unknown
        </button>
      </div>

      {visibleStreamers.length === 0 ? (
        <p>لا يوجد ستريمرات الآن.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {visibleStreamers.map((s) => (
            <div key={s.id} style={{ border: "1px solid #333", borderRadius: 10, padding: 12 }}>
              <div>
                <b>{s.display_name ?? s.username}</b> ({s.platform})
              </div>
              <div style={{ marginTop: 6 }}>Status: {statusBadge(s.last_status)}</div>

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <a href={s.channel_url} target="_blank" rel="noreferrer">
                  Open Channel
                </a>
                <button onClick={() => deleteStreamer(s.id)} style={{ padding: "6px 10px" }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}