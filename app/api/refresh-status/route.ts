import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
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

    let result = { status: "unknown", title: null, category: null, viewers: null };

    if ((s.platform ?? "").toLowerCase() === "kick") {
      result = await checkKick(s.username);
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