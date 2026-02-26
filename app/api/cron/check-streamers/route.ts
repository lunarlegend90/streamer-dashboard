import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

type KickChannelResponse = {
  is_live?: boolean;
  livestream?: {
    session_title?: string | null;
    viewers?: number | null;
    categories?: Array<{ name?: string | null }> | null;
  } | null;
};

async function checkKick(username: string) {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(username)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (CronBot)" },
    cache: "no-store",
  });

  // ✅ رجّع لنا كود الاستجابة عشان نعرف هل Kick حاجب؟
  const http = res.status;

  if (!res.ok) {
    return { status: "unknown", title: null, category: null, viewers: null, http };
  }

  const json = (await res.json()) as any;

  const isLive = Boolean(json?.is_live);
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

let twitchTokenCache: { token: string; expiresAt: number } | null = null;

async function getTwitchAppToken() {
  const now = Date.now();
  if (twitchTokenCache && now < twitchTokenCache.expiresAt) return twitchTokenCache.token;

  const clientId = process.env.TWITCH_CLIENT_ID!;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET!;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) return null;

  const json: any = await res.json();
  const token = json.access_token as string;
  const expiresIn = (json.expires_in as number) ?? 3600;

  twitchTokenCache = { token, expiresAt: now + (expiresIn - 60) * 1000 };
  return token;
}

async function checkTwitch(username: string) {
  const clientId = process.env.TWITCH_CLIENT_ID!;
  const token = await getTwitchAppToken();
  if (!token) return { status: "unknown", title: null, category: null, viewers: null };

  const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(username)}`;

  const res = await fetch(url, {
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) return { status: "unknown", title: null, category: null, viewers: null };

  const json: any = await res.json();
  const stream = json?.data?.[0];

  if (!stream) return { status: "offline", title: null, category: null, viewers: null };

  return {
    status: "online",
    title: stream.title ?? null,
    category: stream.game_name ?? null,
    viewers: stream.viewer_count ?? null,
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
    .eq("is_enabled", true);

  if (sErr) {
    return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  }

  let checked = 0;
  let updated = 0;
  const debug: any[] = [];

  for (const s of streamers ?? []) {
    checked++;

    // حالياً نفحص Kick فقط. باقي المنصات نخليها unknown.
    let result: any = { status: "unknown", title: null, category: null, viewers: null, http: null };

    if ((s.platform ?? "").toLowerCase() === "kick") {
      result = await checkKick(s.username);
    }

    debug.push({
  username: s.username,
  platform: s.platform,
  result,
});

    const nowIso = new Date().toISOString();

    // تحديث جدول streamers
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

    // log (اختياري)
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