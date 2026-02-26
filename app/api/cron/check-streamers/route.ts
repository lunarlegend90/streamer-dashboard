import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
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

  let updated = 0;

  for (const s of streamers ?? []) {
    // مؤقت: نخلي الحالة unknown ونحدث وقت الفحص
    const nowIso = new Date().toISOString();

    const { error: uErr } = await admin
      .from("streamers")
      .update({ last_checked_at: nowIso })
      .eq("id", s.id);

    if (!uErr) updated++;

    // log (اختياري)
    await admin.from("streamer_status_logs").insert({
      streamer_id: s.id,
      status: s.last_status ?? "unknown",
      checked_at: nowIso,
    });
  }

  return NextResponse.json({
    ok: true,
    checked: streamers?.length ?? 0,
    updated,
  });
}