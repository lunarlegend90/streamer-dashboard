import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
  // retries خفيفة لتجنب مشاكل 429/5xx المؤقتة
  const waits = [0, 700, 1500];
  let lastStatus = 0;

  for (let i = 0; i < waits.length; i++) {
    if (waits[i] > 0) await sleep(waits[i]);

    const res = await fetchWithTimeout(
      url,
      {
        headers: { "User-Agent": "Mozilla/5.0 (CronBot)" },
        cache: "no-store",
      },
      timeoutMs
    );

    lastStatus = res.status;

    if (res.ok) {
      const json = await res.json();
      return { ok: true as const, status: res.status, json };
    }

    // لو 429 أو 5xx نعيد المحاولة
    if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
      continue;
    }

    // باقي الأخطاء ما نعيد
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

    await admin.from("open_notifications").insert({
      user_id: u.id,
      streamer_id: streamerId,
      status: "pending",
    });
  }
}

async function checkKick(username: string) {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(username)}`;

  const r = await fetchJsonWithRetry(url, 8000);
  const http = r.status;

  if (!r.ok) {
    return { status: "unknown", title: null, category: null, viewers: null, http };
  }

  const json = r.json as any;

  const isLive = Boolean(json?.livestream?.is_live);
  const title = json?.livestream?.session_title ?? null;
  const viewers = json?.livestream?.viewers ?? null;
  const category = json?.livestream?.categories?.[0]?.name ?? null;

  return {
    status: isLive ? "online" : "offline",
    title,
    category,
    viewers,
    http,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: streamers, error: sErr } = await admin
    .from("streamers")
    .select("*")
    .eq("is_enabled", true)
    .eq("platform", "kick"); // ✅ Kick only

  if (sErr) {
    return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  }

  let checked = 0;
  let updated = 0;

  for (const s of streamers ?? []) {
    checked++;

    // ✅ throttle عشوائي بسيط بين كل قناة (يقلل احتمالية حظر Kick)
    await sleep(400 + Math.floor(Math.random() * 400)); // 400-800ms

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

  return NextResponse.json({ ok: true, version: "cron-kick-throttle-v1", checked, updated });
}