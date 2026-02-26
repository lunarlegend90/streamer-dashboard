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

  return NextResponse.json({ ok: true, version: "kick-v2", checked, updated, debug });
}