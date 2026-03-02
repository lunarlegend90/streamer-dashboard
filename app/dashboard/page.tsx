"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Streamer = {
  id: string;
  user_id?: string;
  platform: string;
  username: string;
  display_name: string | null;
  channel_url: string;
  last_status: string;
  is_global?: boolean;
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

type SubRow = {
  status: string | null;
  current_period_end: string | null;
};

type PendingUser = {
  id: string;
  email: string | null;
  is_approved: boolean;
  approved_at: string | null;
  role: string | null;
  is_admin: boolean;
};

export default function DashboardPage() {
  const [email, setEmail] = useState<string>("");
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [msg, setMsg] = useState<string>("");

  // ✅ Kick only
  const [platform, setPlatform] = useState<"kick">("kick");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [channelUrl, setChannelUrl] = useState("");

  const [pending, setPending] = useState<PendingNotif[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "unknown">("all");
  const [search, setSearch] = useState("");

  // Auto-open settings
  const [autoOpenEnabled, setAutoOpenEnabled] = useState<boolean>(true);
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(30);

  // 🔊 Sound toggle (localStorage)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const lastPendingCountRef = useRef<number>(0);

  // ✅ Auto-open: prevent duplicate opening (pending table)
  const openedAutoRef = useRef<Set<number>>(new Set());
  const isAutoOpeningRef = useRef<boolean>(false);

  // ✅ Admin
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminTarget, setAdminTarget] = useState<string>(""); // email OR uuid
  const [adminPlan, setAdminPlan] = useState<"standard" | "elite" | "plus" | "pro">("standard");
  const [adminStatus, setAdminStatus] = useState<"free" | "active" | "trialing">("active");

  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [pendingUsersLoading, setPendingUsersLoading] = useState<boolean>(false);
  const approvingRef = useRef<Set<string>>(new Set());

  // ✅ Open guards
  const isOpeningAllRef = useRef<boolean>(false);
  const isOpeningOnlineRef = useRef<boolean>(false);

  // ✅ Auto-open ONLINE after cooldown (يفتح فقط اللي ما انفتح قبل)
  const lastAutoOnlineRunRef = useRef<number>(0);
  const autoOnlineTimeoutRef = useRef<any>(null);
  const autoOnlineIntervalRef = useRef<any>(null);
  const autoOpenedOnlineRef = useRef<Set<string>>(new Set()); // key opened during this page session

  // ✅ keep latest streamers without resetting timers
  const streamersRef = useRef<Streamer[]>([]);
  useEffect(() => {
    streamersRef.current = streamers;
  }, [streamers]);

  const normalizeStatus = (s: string) => (s ?? "unknown").toLowerCase();
  const statusRank: Record<string, number> = { online: 0, offline: 1, unknown: 2 };

  // ---------- UI styles (Nexus) ----------
  const styles = useMemo(() => {
    const card: React.CSSProperties = {
      border: "1px solid var(--card-border)",
      background: "var(--card)",
      borderRadius: 16,
      padding: 16,
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      backdropFilter: "blur(10px)",
    };

    const label: React.CSSProperties = { display: "grid", gap: 6 };

    const input: React.CSSProperties = {
      width: "100%",
      padding: "12px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.06)",
      color: "var(--foreground)",
      outline: "none",
    };

    const smallInput: React.CSSProperties = {
      ...input,
      padding: "10px 12px",
    };

    const select: React.CSSProperties = {
      ...input,
      appearance: "none",
      WebkitAppearance: "none",
      MozAppearance: "none",
      backgroundColor: "rgba(10, 14, 22, 0.85)",
      color: "var(--foreground)",
      border: "1px solid rgba(255,255,255,0.14)",
      colorScheme: "dark" as any,
    };

    const option: React.CSSProperties = {
      backgroundColor: "rgba(10, 14, 22, 0.98)",
      color: "rgba(255,255,255,0.92)",
    };

    const buttonBase: React.CSSProperties = {
      padding: "10px 14px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.14)",
      color: "var(--foreground)",
      background: "rgba(255,255,255,0.06)",
      cursor: "pointer",
      transition: "transform 0.08s ease, background 0.15s ease, border-color 0.15s ease",
      fontWeight: 700,
      userSelect: "none",
    };

    const btnPrimary: React.CSSProperties = {
      ...buttonBase,
      border: "1px solid rgba(42,168,255,0.35)",
      background:
        "linear-gradient(135deg, rgba(42,168,255,0.22) 0%, rgba(123,211,255,0.12) 55%, rgba(255,255,255,0.06) 100%)",
      boxShadow: "0 0 0 1px rgba(42,168,255,0.10), 0 12px 30px rgba(42,168,255,0.12)",
    };

    const btnSecondary: React.CSSProperties = {
      ...buttonBase,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(255,255,255,0.06)",
    };

    const btnDanger: React.CSSProperties = {
      ...buttonBase,
      border: "1px solid rgba(255,106,0,0.40)",
      background:
        "linear-gradient(135deg, rgba(255,106,0,0.22) 0%, rgba(255,177,74,0.10) 60%, rgba(255,255,255,0.06) 100%)",
      boxShadow: "0 0 0 1px rgba(255,106,0,0.10), 0 12px 30px rgba(255,106,0,0.12)",
    };

    const btnGhost: React.CSSProperties = {
      ...buttonBase,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "transparent",
    };

    const chip: React.CSSProperties = {
      padding: "6px 10px",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: 12,
      background: "rgba(255,255,255,0.05)",
    };

    const sectionTitle: React.CSSProperties = { margin: "0 0 10px 0", fontSize: 18 };

    const banner: React.CSSProperties = {
      ...card,
      padding: 12,
      borderRadius: 14,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      border: "1px solid rgba(42,168,255,0.22)",
      background:
        "linear-gradient(135deg, rgba(42,168,255,0.14) 0%, rgba(255,106,0,0.10) 65%, rgba(255,255,255,0.04) 100%)",
    };

    return {
      card,
      banner,
      label,
      input,
      smallInput,
      select,
      option,
      btnPrimary,
      btnSecondary,
      btnDanger,
      btnGhost,
      chip,
      sectionTitle,
    };
  }, []);

  const statusBadge = (st: string) => {
    const s = (st ?? "unknown").toLowerCase();
    const base: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "2px 10px",
      borderRadius: 999,
      fontSize: 12,
      border: "1px solid rgba(255,255,255,0.16)",
      fontWeight: 800,
      letterSpacing: 0.4,
      background: "rgba(255,255,255,0.06)",
    };

    if (s === "online") {
      return (
        <span style={{ ...base, borderColor: "rgba(42,168,255,0.40)" }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--nexus-ice)" }} />
          ONLINE
        </span>
      );
    }
    if (s === "offline") {
      return (
        <span style={{ ...base, borderColor: "rgba(255,255,255,0.22)", opacity: 0.9 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: "rgba(255,255,255,0.55)" }} />
          OFFLINE
        </span>
      );
    }
    return (
      <span style={{ ...base, borderColor: "rgba(255,106,0,0.40)" }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--nexus-fire)" }} />
        UNKNOWN
      </span>
    );
  };

  const beep = async () => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.03;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close();
      }, 180);
    } catch {}
  };

  // ✅ Subscription + Approval gate
  const checkSubscriptionGate = async () => {
    const { data: u } = await supabase.auth.getUser();
    const user = u.user;

    if (!user) {
      window.location.href = "/login";
      return false;
    }

    setEmail(user.email ?? "");

    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("is_approved")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) {
      setMsg(`⚠️ Profile check error: ${pErr.message}`);
    } else {
      const approved = Boolean((prof as any)?.is_approved);
      if (!approved) {
        await supabase.auth.signOut();
        window.location.href = "/login";
        return false;
      }
    }

    const { data, error } = await supabase
      .from("subscriptions")
      .select("status,current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      setMsg(`⚠️ Subscription check error: ${error.message}`);
      return true;
    }

    const row = (data as SubRow | null) ?? null;
    const st = (row?.status ?? "inactive").toLowerCase();

    if (st !== "active" && st !== "trialing") {
      window.location.href = "/billing";
      return false;
    }

    return true;
  };

  const loadIsAdmin = async () => {
    const { data: u } = await supabase.auth.getUser();
    const user = u.user;
    if (!user) return;

    const { data, error } = await supabase.from("profiles").select("is_admin,role").eq("id", user.id).maybeSingle();
    if (error || !data) return;

    const row: any = data;
    const admin = Boolean(row.is_admin) || String(row.role ?? "").toLowerCase() === "admin";
    setIsAdmin(admin);
  };

  const load = async (silent = false) => {
    if (!silent) setMsg("جاري تحميل البيانات...");

    const { data: userData } = await supabase.auth.getUser();
    const me = userData.user;

    setEmail(me?.email ?? "");

    if (!me) {
      if (!silent) setMsg("❌ لا يوجد تسجيل دخول.");
      return;
    }

    const { data, error } = await supabase
      .from("streamers")
      .select("id, user_id, platform, username, display_name, channel_url, last_status, is_global")
      .ilike("platform", "kick")
      .eq("is_global", true)
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

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      setMsg(`❌ pending error: ${data.error ?? res.status}`);
      setPending([]);
      return;
    }

    setPending(data.items ?? []);
  };

  const loadPendingUsers = async () => {
    if (!isAdmin) return;

    setPendingUsersLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setPendingUsers([]);
        setMsg("❌ لا يوجد تسجيل دخول.");
        return;
      }

      const res = await fetch("/api/admin/users/pending", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setMsg(`❌ Pending users error: ${data.error ?? res.status}`);
        setPendingUsers([]);
        return;
      }

      setPendingUsers((data.items ?? []) as PendingUser[]);
    } finally {
      setPendingUsersLoading(false);
    }
  };

  const approveUser = async (userId: string) => {
    if (!isAdmin) return;
    if (!userId) return;
    if (approvingRef.current.has(userId)) return;

    const yes = confirm("Approve this user?");
    if (!yes) return;

    approvingRef.current.add(userId);
    try {
      setMsg("جاري الموافقة على المستخدم...");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setMsg("❌ لا يوجد تسجيل دخول.");
        return;
      }

      const res = await fetch("/api/admin/users/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setMsg(`❌ Approve error: ${data.error ?? res.status}`);
        return;
      }

      setMsg(`✅ Approved: ${userId}`);
      await loadPendingUsers();
    } finally {
      approvingRef.current.delete(userId);
    }
  };

  // ✅ helper: unique online kick URLs
  const getUniqueOnline = (src?: Streamer[]) => {
    const list = src ?? streamers;

    const online = list
      .filter((s) => (s.platform ?? "").toLowerCase() === "kick")
      .filter((s) => normalizeStatus(s.last_status) === "online");

    const seen = new Set<string>();
    const unique: { key: string; url: string }[] = [];

    for (const s of online) {
      const uname = String(s.username ?? "")
        .trim()
        .replace(/^@+/, "")
        .replace(/^\/+/, "")
        .toLowerCase();

      const url = uname ? `https://kick.com/${uname}` : String(s.channel_url ?? "").trim();
      const key = uname || url;

      if (!key || !url) continue;
      if (seen.has(key)) continue;
      seen.add(key);

      unique.push({ key, url });
    }

    return unique;
  };

  // ✅ keep old button: Open ONLINE manually (confirm)
  const openAllOnlineNow = () => {
    const unique = getUniqueOnline(streamers);

    if (unique.length === 0) {
      setMsg("لا يوجد ستريمرز Online حاليا.");
      return;
    }

    if (isOpeningOnlineRef.current) return;

    const yes = confirm(`Open ONLINE (${unique.length}) الآن؟`);
    if (!yes) return;

    isOpeningOnlineRef.current = true;

    try {
      const wins: Window[] = [];
      let blocked = 0;

      for (let i = 0; i < unique.length; i++) {
        const w = window.open("", "_blank");
        if (!w) blocked++;
        else wins.push(w);
      }

      for (let i = 0; i < wins.length; i++) {
        try {
          wins[i].location.replace(unique[i].url);
        } catch {}
      }

      if (blocked > 0) {
        setMsg(`⚠️ تم فتح ${wins.length}/${unique.length}. المتصفح منع ${blocked} تبويب. فعّل Pop-ups للموقع.`);
      } else {
        setMsg(`✅ تم فتح ${wins.length}/${unique.length} تبويب (ONLINE)`);
      }
    } finally {
      setTimeout(() => {
        isOpeningOnlineRef.current = false;
      }, 800);
    }
  };

  // ✅ Auto open ONLINE after cooldown (يفتح فقط اللي ما انفتحوا قبل)
  const autoOpenOnlineAfterCooldown = () => {
    if (!autoOpenEnabled) return;
    if (isOpeningOnlineRef.current) return;

    const unique = getUniqueOnline(streamersRef.current);
    if (unique.length === 0) return;

    // ✅ open ONLY ones that were NOT auto-opened before
    const toOpen = unique.filter((x) => !autoOpenedOnlineRef.current.has(x.key));
    if (toOpen.length === 0) return;

    isOpeningOnlineRef.current = true;

    try {
      const MAX_PER_BATCH = 10; // تقدر تعدله
      const batch = toOpen.slice(0, MAX_PER_BATCH);

      const wins: Window[] = [];
      let blocked = 0;

      for (let i = 0; i < batch.length; i++) {
        const w = window.open("", "_blank");
        if (!w) blocked++;
        else wins.push(w);
      }

      for (let i = 0; i < wins.length; i++) {
        try {
          wins[i].location.replace(batch[i].url);
        } catch {}
      }

      // ✅ mark as opened so it won't repeat next cooldown
      for (const x of batch) autoOpenedOnlineRef.current.add(x.key);

      if (blocked > 0) {
        setMsg(`⚠️ Auto-Open حاول يفتح ${batch.length}. المتصفح منع ${blocked} تبويب. فعّل Pop-ups للموقع.`);
      } else {
        setMsg(`✅ Auto-Open فتح ${wins.length}/${batch.length} تبويب (ONLINE)`);
      }
    } finally {
      lastAutoOnlineRunRef.current = Date.now();
      setTimeout(() => {
        isOpeningOnlineRef.current = false;
      }, 800);
    }
  };

  // ✅ IMPORTANT FIX: لا نمسح autoOpenedOnlineRef إلا إذا صار Offline
  // (عشان ما يعيد فتح نفس اللي Online كل مرة)
  useEffect(() => {
    const onlineKeys = new Set(getUniqueOnline(streamers).map((x) => x.key));
    const next = new Set<string>();

    for (const k of autoOpenedOnlineRef.current) {
      if (onlineKeys.has(k)) next.add(k);
      // إذا صار Offline -> ينشال تلقائياً، وإذا رجع Online لاحقاً ينفتح مرة ثانية (هذا المطلوب)
    }

    autoOpenedOnlineRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamers]);

  // ✅ schedule auto-open online after cooldown and repeat
  useEffect(() => {
    if (autoOnlineTimeoutRef.current) clearTimeout(autoOnlineTimeoutRef.current);
    if (autoOnlineIntervalRef.current) clearInterval(autoOnlineIntervalRef.current);

    if (!autoOpenEnabled) return;

    const ms = Math.max(1, Number(cooldownMinutes || 1)) * 60 * 1000;

    autoOnlineTimeoutRef.current = setTimeout(() => {
      autoOpenOnlineAfterCooldown();

      autoOnlineIntervalRef.current = setInterval(() => {
        autoOpenOnlineAfterCooldown();
      }, ms);
    }, ms);

    return () => {
      if (autoOnlineTimeoutRef.current) clearTimeout(autoOnlineTimeoutRef.current);
      if (autoOnlineIntervalRef.current) clearInterval(autoOnlineIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenEnabled, cooldownMinutes]);

  const openAllNow = async () => {
    if (pending.length === 0) {
      setMsg("لا يوجد تنبيهات حاليا.");
      return;
    }
    if (isOpeningAllRef.current) return;

    const yes = confirm(`Open ALL (${pending.length}) streams الآن؟`);
    if (!yes) return;

    isOpeningAllRef.current = true;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setMsg("❌ لا يوجد تسجيل دخول. ارجع لصفحة login.");
        return;
      }

      let opened = 0;

      for (const n of pending) {
        const w = window.open(n.streamers.channel_url, "_blank", "noopener,noreferrer");
        if (!w) {
          setMsg("⚠️ المتصفح منع فتح بعض التبويبات. فعّل Pop-ups لموقع Nexus (Allow) ثم جرّب مرة ثانية.");
          break;
        }

        opened++;

        await fetch("/api/auto-open/mark-opened", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ notificationId: n.id, streamerId: n.streamer_id }),
        });
      }

      setMsg(`✅ تم فتح ${opened} / ${pending.length} تبويب`);
      await loadPending();
    } finally {
      isOpeningAllRef.current = false;
    }
  };

  const dismissAll = async () => {
    if (pending.length === 0) return;

    const yes = confirm(`Dismiss all (${pending.length}) notifications?`);
    if (!yes) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMsg("❌ لا يوجد تسجيل دخول. ارجع لصفحة login.");
      return;
    }

    setMsg("جاري إخفاء كل التنبيهات...");

    for (const n of pending) {
      await fetch("/api/auto-open/mark-dismissed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notificationId: n.id }),
      });
    }

    setMsg("✅ تم إخفاء كل التنبيهات");
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

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setMsg(`❌ خطأ: ${data.error ?? "Unknown error"}`);
        return;
      }

      setMsg(`✅ تم تحديث الحالات (${data.updated}/${data.checked})`);
    } catch (e: any) {
      setMsg(`❌ Error: ${e?.message ?? e}`);
    }

    await loadPending();
    await load(true);
  };

  const deleteStreamer = async (id: string) => {
    if (!isAdmin) {
      setMsg("❌ Admin only");
      return;
    }

    if (!confirm("حذف الستريمر؟")) return;

    const { error } = await supabase.from("streamers").delete().eq("id", id);

    if (error) {
      setMsg(`❌ خطأ حذف: ${error.message}`);
      return;
    }

    setMsg("✅ تم حذف الستريمر");
    await load(true);
  };

  const addStreamer = async () => {
    if (!isAdmin) {
      setMsg("❌ Admin only");
      return;
    }

    setMsg("جاري الإضافة...");
    if (!username.trim() || !channelUrl.trim()) {
      setMsg("الرجاء إدخال username و channel URL");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMsg("❌ لا يوجد تسجيل دخول. ارجع لصفحة login.");
      return;
    }

    const res = await fetch("/api/streamers/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        platform: "kick",
        username: username.trim(),
        display_name: displayName.trim() || null,
        channel_url: channelUrl.trim(),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      setMsg(`❌ ${data.error ?? "Unknown error"}`);
      return;
    }

    setUsername("");
    setDisplayName("");
    setChannelUrl("");
    setMsg("✅ تمت الإضافة");
    await load(true);
  };

  const adminFixKickUrls = async () => {
    if (!isAdmin) return;

    const yes = confirm("Fix all Kick channel URLs الآن؟ (Admin only)");
    if (!yes) return;

    setMsg("جاري إصلاح روابط Kick...");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMsg("❌ لا يوجد تسجيل دخول.");
      return;
    }

    const res = await fetch("/api/admin/fix-kick-urls", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      setMsg(`❌ Fix error: ${data.error ?? res.status}`);
      return;
    }

    setMsg(`✅ Fixed URLs: updated=${data.updated} | skipped=${data.skipped} | checked=${data.checked}`);
    await load(true);
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

  const adminSetPlan = async () => {
    if (!isAdmin) return;

    const target = adminTarget.trim();
    if (!target) {
      setMsg("❌ اكتب User ID أو Email أول.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMsg("❌ لا يوجد تسجيل دخول.");
      return;
    }

    const isEmail = target.includes("@");
    setMsg("جاري تحديث الخطة...");

    const res = await fetch("/api/admin/set-plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...(isEmail ? { email: target } : { user_id: target }),
        plan: adminPlan,
        status: adminStatus,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      setMsg(`❌ Admin set plan error: ${data.error ?? res.status}`);
      return;
    }

    setMsg(`✅ Plan updated: ${data.user_id} → ${data.plan} (${data.status})`);
  };

  const applyStreamerChange = (payload: any) => {
    const newRow = payload?.new as any;
    const oldRow = payload?.old as any;

    if (newRow?.id) {
      const mapped: Streamer = {
        id: newRow.id,
        user_id: newRow.user_id,
        platform: newRow.platform,
        username: newRow.username,
        display_name: newRow.display_name ?? null,
        channel_url: newRow.channel_url,
        last_status: newRow.last_status ?? "unknown",
        is_global: newRow.is_global ?? false,
      };

      if (!mapped.is_global) return;

      setStreamers((prev) => {
        const idx = prev.findIndex((s) => s.id === mapped.id);
        if (idx === -1) return [mapped, ...prev];
        const next = [...prev];
        next[idx] = { ...next[idx], ...mapped };
        return next;
      });
      return;
    }

    if (oldRow?.id) {
      setStreamers((prev) => prev.filter((s) => s.id !== oldRow.id));
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // Load sound preference once
  useEffect(() => {
    try {
      const v = localStorage.getItem("nexus_sound");
      if (v === "0") setSoundEnabled(false);
      if (v === "1") setSoundEnabled(true);
    } catch {}
  }, []);

  // 🔔 Update tab title + 🔊 beep on new pending
  useEffect(() => {
    const count = pending.length;
    document.title = count > 0 ? `Nexus (${count})` : "Nexus";

    const prev = lastPendingCountRef.current;
    if (soundEnabled && count > prev) void beep();
    lastPendingCountRef.current = count;
  }, [pending.length, soundEnabled]);

  // ✅ AUTO-OPEN: opens new pending automatically
  useEffect(() => {
    if (!autoOpenEnabled) return;
    if (!pending.length) return;
    if (isAutoOpeningRef.current) return;

    (async () => {
      try {
        isAutoOpeningRef.current = true;

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return;

        const toOpen = pending.filter((n) => !openedAutoRef.current.has(n.id));

        const MAX_OPEN_PER_BATCH = 5;
        const batch = toOpen.slice(0, MAX_OPEN_PER_BATCH);

        for (const n of batch) {
          const w = window.open(n.streamers.channel_url, "_blank", "noopener,noreferrer");

          if (!w) {
            setMsg("⚠️ المتصفح منع فتح التبويبات تلقائيًا. فعّل Pop-ups لموقع Nexus ثم جرّب مرة ثانية.");
            return;
          }

          openedAutoRef.current.add(n.id);

          await fetch("/api/auto-open/mark-opened", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ notificationId: n.id, streamerId: n.streamer_id }),
          });
        }

        if (batch.length > 0) await loadPending();
      } finally {
        isAutoOpeningRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, autoOpenEnabled]);

  // ✅ Realtime + initial load
  useEffect(() => {
    (async () => {
      const ok = await checkSubscriptionGate();
      if (!ok) return;

      await load(true);
      await loadPending();
      await loadAutoOpenSettings();
      await loadIsAdmin();

      const notifsChannel = supabase
        .channel("open_notifications_changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "open_notifications" }, () => {
          loadPending();
        })
        .subscribe();

      const streamersChannel = supabase
        .channel("streamers_changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "streamers" } as any, (payload) =>
          applyStreamerChange(payload)
        )
        .subscribe();

      return () => {
        supabase.removeChannel(notifsChannel);
        supabase.removeChannel(streamersChannel);
      };
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ When isAdmin becomes true, load pending users
  useEffect(() => {
    if (isAdmin) void loadPendingUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // ✅ Search + Counters
  const q = search.trim().toLowerCase();
  const kickStreamers = streamers.filter((s) => (s.platform ?? "").toLowerCase() === "kick");

  const visibleStreamers = kickStreamers
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

  const countOnline = kickStreamers.filter((s) => normalizeStatus(s.last_status) === "online").length;
  const countOffline = kickStreamers.filter((s) => normalizeStatus(s.last_status) === "offline").length;
  const countUnknown = kickStreamers.filter((s) => normalizeStatus(s.last_status) === "unknown").length;

  // ---------- Render ----------
  return (
    <div
      style={{
        maxWidth: 980,
        margin: "40px auto",
        padding: "0 16px",
        fontFamily: "var(--font-geist-sans), Arial, sans-serif",
      }}
    >
      {/* Header */}
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
          style={styles.btnGhost}
          onMouseDown={(e) => ((e.currentTarget.style.transform as any) = "scale(0.98)")}
          onMouseUp={(e) => ((e.currentTarget.style.transform as any) = "scale(1)")}
        >
          Sign Out
        </button>
      </div>

      {/* Message */}
      <div style={{ ...styles.card, marginTop: 14, padding: 12 }}>
        <div style={{ fontSize: 13, color: msg ? "var(--foreground)" : "var(--muted)" }}>{msg || "—"}</div>
      </div>

      {/* Banner if pending */}
      {pending.length > 0 && (
        <div style={{ ...styles.banner, marginTop: 14 }}>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontWeight: 900 }}>
              🔔 New live streams: <span style={{ color: "var(--foreground)" }}>{pending.length}</span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              إذا Auto-Open ON و Pop-ups مسموحة، راح ينفتح تلقائيًا.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              style={styles.btnSecondary}
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                try {
                  localStorage.setItem("nexus_sound", next ? "1" : "0");
                } catch {}
              }}
              title="Toggle sound"
            >
              {soundEnabled ? "🔊 Sound: ON" : "🔇 Sound: OFF"}
            </button>

            <button style={styles.btnPrimary} onClick={openAllNow} title="Open all pending streams">
              Open All
            </button>

            <button style={styles.btnDanger} onClick={dismissAll}>
              Dismiss All
            </button>
          </div>
        </div>
      )}

      {/* Auto-Open Settings */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <h2 style={styles.sectionTitle}>Auto-Open Settings</h2>

        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <input
            type="checkbox"
            checked={autoOpenEnabled}
            onChange={(e) => setAutoOpenEnabled(e.target.checked)}
            style={{ transform: "scale(1.05)" }}
          />
          <span style={{ color: "var(--foreground)" }}>Enable Auto-Open notifications</span>
        </label>

        <div style={{ marginTop: 12 }}>
          <label style={styles.label}>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>Cooldown (minutes)</span>
            <input
              type="number"
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(Number(e.target.value))}
              style={styles.smallInput}
              min={0}
              max={1440}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button style={styles.btnPrimary} onClick={saveAutoOpenSettings}>
            Save Settings
          </button>
          <button style={styles.btnSecondary} onClick={refreshStatus} title="Force refresh now">
            Refresh Status
          </button>
        </div>

        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
          ✅ بعد انتهاء الـ Cooldown، النظام راح يفتح تلقائيًا <b>فقط</b> الستريمرز Online اللي ما انفتحوا قبل (بدون تكرار).
          <br />
          إذا صار الستريمر Offline ثم رجع Online، ينفتح مرة ثانية (هذا طبيعي).
        </div>
      </div>

      {/* Admin: Pending Signups */}
      {isAdmin && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={styles.sectionTitle}>Admin: Pending Signups</h2>
            <button style={styles.btnSecondary} onClick={loadPendingUsers} disabled={pendingUsersLoading}>
              {pendingUsersLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {pendingUsers.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>لا يوجد طلبات جديدة.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {pendingUsers.map((u) => (
                <div key={u.id} style={{ ...styles.card, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={{ fontWeight: 900 }}>
                        {u.email ?? "(no email)"}{" "}
                        <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 12 }}>({u.id})</span>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        Approved: <b style={{ color: "var(--foreground)" }}>{String(u.is_approved)}</b>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        style={styles.btnPrimary}
                        onClick={() => approveUser(u.id)}
                        disabled={approvingRef.current.has(u.id)}
                      >
                        {approvingRef.current.has(u.id) ? "Approving..." : "Approve"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin: Set Plan */}
      {isAdmin && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <h2 style={styles.sectionTitle}>Admin: Set User Plan</h2>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={styles.label}>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>Target (User ID or Email)</span>
              <input
                value={adminTarget}
                onChange={(e) => setAdminTarget(e.target.value)}
                style={styles.input}
                placeholder="UUID أو email@example.com"
              />
            </label>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ ...styles.label, flex: 1, minWidth: 180 }}>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>Plan</span>
                <select value={adminPlan} onChange={(e) => setAdminPlan(e.target.value as any)} style={styles.select}>
                  <option style={styles.option} value="standard">standard (30)</option>
                  <option style={styles.option} value="elite">elite (100)</option>
                  <option style={styles.option} value="plus">plus (200)</option>
                  <option style={styles.option} value="pro">pro (300)</option>
                </select>
              </label>

              <label style={{ ...styles.label, flex: 1, minWidth: 180 }}>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>Status</span>
                <select value={adminStatus} onChange={(e) => setAdminStatus(e.target.value as any)} style={styles.select}>
                  <option style={styles.option} value="active">active</option>
                  <option style={styles.option} value="trialing">trialing</option>
                  <option style={styles.option} value="free">free</option>
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={styles.btnPrimary} onClick={adminSetPlan}>Apply Plan</button>
              <button style={styles.btnSecondary} onClick={adminFixKickUrls} title="Fix Kick URLs">Fix Kick URLs</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Streamer (ADMIN ONLY) ✅ هذا اللي كان ناقص عندك في الصورة */}
      {isAdmin && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <h2 style={styles.sectionTitle}>Add Streamer (Kick Only)</h2>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={styles.label}>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>Platform</span>
              <select value={platform} onChange={() => setPlatform("kick")} style={styles.select} disabled>
                <option style={styles.option} value="kick">kick</option>
              </select>
            </label>

            <label style={styles.label}>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>Username (required)</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} style={styles.input} placeholder="مثال: nofear" />
            </label>

            <label style={styles.label}>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>Display Name (optional)</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={styles.input} placeholder="مثال: NOFEAR" />
            </label>

            <label style={styles.label}>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>Channel URL (required)</span>
              <input value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} style={styles.input} placeholder="https://kick.com/..." />
            </label>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <button style={styles.btnPrimary} onClick={addStreamer}>Add</button>
              <button style={styles.btnSecondary} onClick={refreshStatus}>Refresh Status</button>
            </div>
          </div>
        </div>
      )}

      {/* Streamers */}
      <div style={{ marginTop: 18 }}>
        <h2 style={{ margin: "0 0 10px 0", fontSize: 18 }}>Streamers (Kick)</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name/username..."
            style={{ ...styles.input, minWidth: 260, maxWidth: 360 }}
          />

          <span style={styles.chip}>Online: <b>{countOnline}</b></span>
          <span style={styles.chip}>Offline: <b>{countOffline}</b></span>
          <span style={styles.chip}>Unknown: <b>{countUnknown}</b></span>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button style={statusFilter === "all" ? styles.btnPrimary : styles.btnSecondary} onClick={() => setStatusFilter("all")}>All</button>
          <button style={statusFilter === "online" ? styles.btnPrimary : styles.btnSecondary} onClick={() => setStatusFilter("online")}>Online</button>
          <button style={statusFilter === "offline" ? styles.btnPrimary : styles.btnSecondary} onClick={() => setStatusFilter("offline")}>Offline</button>
          <button style={statusFilter === "unknown" ? styles.btnPrimary : styles.btnSecondary} onClick={() => setStatusFilter("unknown")}>Unknown</button>

          {/* ✅ keep old button */}
          <button style={styles.btnPrimary} onClick={openAllOnlineNow} title="Open all ONLINE channels">
            Open Online
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {visibleStreamers.length === 0 ? (
            <div style={{ ...styles.card, color: "var(--muted)" }}>لا يوجد ستريمرات الآن.</div>
          ) : (
            visibleStreamers.map((s) => (
              <div key={s.id} style={{ ...styles.card, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 15 }}>
                      <b>{s.display_name ?? s.username}</b> <span style={{ color: "var(--muted)" }}>({s.platform})</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "var(--muted)", fontSize: 13 }}>Status:</span>
                      {statusBadge(s.last_status)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <a
                      href={s.channel_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        ...styles.btnSecondary,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      Open Channel
                    </a>

                    {isAdmin && (
                      <button style={styles.btnDanger} onClick={() => deleteStreamer(s.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}