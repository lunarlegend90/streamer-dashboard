import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function supabaseAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchJsonWithRetry(url: string, timeoutMs = 8000) {
  const waits = [0, 500, 1200];
  let lastStatus = 0;

  for (let i = 0; i < waits.length; i++) {
    if (waits[i] > 0) await sleep(waits[i]);

    const res = await fetchWithTimeout(
      url,
      { headers: { "User-Agent": "Mozilla/5.0 (CronBot)" }, cache: "no-store" },
      timeoutMs
    );

    lastStatus = res.status;

    if (res.ok) return { ok: true as const, status: res.status, json: await res.json() };

    if (res.status === 429 || (res.status >= 500 && res.status <= 599)) continue;

    break;
  }

  return { ok: false as const, status: lastStatus, json: null as any };
}

async function enqueueAutoOpenForAllUsers(admin: any, streamerId: string) {
  const { data: settings } = await admin.from("system_settings").select("*").eq("id", 1).single();
  if (!settings?.auto_open_enabled) return;

  const cooldownMin = Number(settings.auto_open_cooldown_minutes ?? 0);

  const { data: users } = await admin.from("profiles").select("id");
  if (!users?.length) return;

  const now = new Date();
  const cutoffIso = new Date(now.getTime() - cooldownMin * 60 * 1000).toISOString();

  for (const u of users) {
    const { data: recent } = await admin
      .from("auto_open_events")
      .select("id")
      .eq("user_id", u.id)
      .eq("streamer_id", streamerId)
      .gte("opened_at", cutoffIso)
      .limit(1);

    if (recent && recent.length > 0) continue;

    const { data: pending } = await admin
      .from("open_notifications")
      .select("id")
      .eq("user_id", u.id)
      .eq("streamer_id", streamerId)
      .eq("status", "pending")
      .limit(1);

    if (pending && pending.length > 0) continue;

    await admin.from("open_notifications").insert({ user_id: u.id, streamer_id: streamerId, status: "pending" });
  }
}

async function requireAuth(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const anon = supabaseAnon();
  const { data } = await anon.auth.getUser(token);
  return data.user ?? null;
}

async function checkKick(username: string) {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(username)}`;
  const r = await fetchJsonWithRetry(url, 8000);

  if (!r.ok) return { status: "unknown", title: null, category: null, viewers: null };

  const json: any = r.json;
  const isLive = Boolean(json?.livestream?.is_live);

  return {
    status: isLive ? "online" : "offline",
    title: json?.livestream?.session_title ?? null,
    category: json?.livestream?.categories?.[0]?.name ?? null,
    viewers: json?.livestream?.viewers ?? null,
  };
}

// ✅ Rate limit: مرة كل 15 ثانية لكل مستخدم
async function enforceRateLimit(admin: any, userId: string, windowSeconds = 15) {
  // جدول بسيط داخل supabase: api_rate_limits
  // (لو ما موجود بنسويه في الخطوة 2)
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - windowSeconds * 1000).toISOString();

  const { data: row } = await admin.from("api_rate_limits").select("*").eq("key", `refresh:${userId}`).single();

  if (row?.last_hit_at && row.last_hit_at > cutoff) {
    const waitMs = new Date(row.last_hit_at).getTime() + windowSeconds * 1000 - now.getTime();
    return { ok: false as const, waitSeconds: Math.ceil(Math.max(0, waitMs) / 1000) };
  }

  await admin.from("api_rate_limits").upsert({ key: `refresh:${userId}`, last_hit_at: nowIso });
  return { ok: true as const, waitSeconds: 0 };
}

export async function POST(req: Request) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  // ✅ rate limit
  const rl = await enforceRateLimit(admin, user.id, 15);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: `Too many requests. Try again in ${rl.waitSeconds}s.` },
      { status: 429 }
    );
  }

  const { data: streamers, error: sErr } = await admin
    .from("streamers")
    .select("*")
    .eq("is_enabled", true)
    .eq("platform", "kick");

  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });

  let checked = 0;
  let updated = 0;

  for (const s of streamers ?? []) {
    checked++;

    await sleep(200 + Math.floor(Math.random() * 250)); // 200-450ms

    const before = (s.last_status ?? "unknown").toLowerCase();
    const result = await checkKick(s.username);
    const after = (result.status ?? "unknown").toLowerCase();

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

  return NextResponse.json({ ok: true, version: "refresh-kick-rate-limit-v1", checked, updated });
}