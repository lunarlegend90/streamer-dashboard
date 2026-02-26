import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function enqueueAutoOpenForAllUsers(admin: any, streamerId: string) {
  // settings
  const { data: settings } = await admin.from("system_settings").select("*").eq("id", 1).single();
  if (!settings?.auto_open_enabled) return;

  const cooldownMin = Number(settings.auto_open_cooldown_minutes ?? 0);

  // all users
  const { data: users } = await admin.from("profiles").select("id");
  if (!users?.length) return;

  const now = new Date();
  const cutoffIso = new Date(now.getTime() - cooldownMin * 60 * 1000).toISOString();

  for (const u of users) {
    // cooldown check: did this user open this streamer recently?
    const { data: recent } = await admin
      .from("auto_open_events")
      .select("id")
      .eq("user_id", u.id)
      .eq("streamer_id", streamerId)
      .gte("opened_at", cutoffIso)
      .limit(1);

    if (recent && recent.length > 0) continue;

    // avoid duplicate pending notifications
    const { data: pending } = await admin
      .from("open_notifications")
      .select("id")
      .eq("user_id", u.id)
      .eq("streamer_id", streamerId)
      .eq("status", "pending")
      .limit(1);

    if (pending && pending.length > 0) continue;

    await admin.from("open_notifications").insert({
      user_id: u.id,
      streamer_id: streamerId,
      status: "pending",
    });
  }
}

// تحقق تسجيل الدخول: لازم يرسل Authorization: Bearer <access_token>
async function requireAuth(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const { data } = await client.auth.getUser(token);
  return data.user ?? null;
}

async function checkKick(username: string) {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (CronBot)" },
    cache: "no-store",
  });
  if (!res.ok) return { status: "unknown", title: null, category: null, viewers: null };

  const json: any = await res.json();
  const isLive = Boolean(json?.is_live);
  return {
    status: isLive ? "online" : "offline",
    title: json?.livestream?.session_title ?? null,
    category: json?.livestream?.categories?.[0]?.name ?? null,
    viewers: json?.livestream?.viewers ?? null,
  };
}

export async function POST(req: Request) {
  const user = await requireAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: streamers, error: sErr } = await admin
    .from("streamers")
    .select("*")
    .eq("is_enabled", true);

  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });

  let checked = 0;
  let updated = 0;

  for (const s of streamers ?? []) {
  checked++;

  const before = (s.last_status ?? "unknown").toLowerCase();

  let result: any = { status: "unknown", title: null, category: null, viewers: null };

  const p = (s.platform ?? "").toLowerCase();
  if (p === "kick") result = await checkKick(s.username);
  // (لو عندك checkTwitch هنا وتبي auto-open للتويتش بعدين، نضيفها لاحقًا)

  const after = (result.status ?? "unknown").toLowerCase();

  // ✅ Auto-open trigger
  if (before !== "online" && after === "online") {
    await enqueueAutoOpenForAllUsers(admin, s.id);
  }

  const nowIso = new Date().toISOString();

  const { error: uErr } = await admin
    .from("streamers")
    .update({
      last_status: result.status,
      last_checked_at: nowIso,
      last_live_title: result.title,
      last_category: result.category,
      last_viewer_count: result.viewers,
    })
    .eq("id", s.id);

  if (!uErr) updated++;

  await admin.from("streamer_status_logs").insert({
    streamer_id: s.id,
    status: result.status,
    viewer_count: result.viewers,
    title: result.title,
    category: result.category,
    checked_at: nowIso,
  });
}

  return NextResponse.json({ ok: true, checked, updated });
}