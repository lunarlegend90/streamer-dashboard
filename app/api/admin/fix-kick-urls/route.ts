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

async function requireAuth(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const anon = supabaseAnon();
  const { data } = await anon.auth.getUser(token);
  return data.user ?? null;
}

function isAdminProfileRow(row: any) {
  return Boolean(row?.is_admin) || String(row?.role ?? "").toLowerCase() === "admin";
}

function canonicalKickUrl(username: string) {
  const u = (username ?? "").trim().replace(/^@+/, "").toLowerCase();
  return `https://kick.com/${u}`;
}

export async function POST(req: Request) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  // ✅ must be admin
  const { data: prof, error: pErr } = await admin
    .from("profiles")
    .select("is_admin,role")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
  if (!isAdminProfileRow(prof)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // get all kick streamers (across all users)
  const { data: rows, error: sErr } = await admin
    .from("streamers")
    .select("id, username, channel_url, platform")
    .ilike("platform", "kick");

  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });

  const list = (rows ?? []) as any[];

  let updated = 0;
  let skipped = 0;

  // تحديث واحد واحد (آمن وبسيط)
  for (const r of list) {
    const uname = String(r.username ?? "").trim();
    if (!uname) {
      skipped++;
      continue;
    }

    const newUrl = canonicalKickUrl(uname);
    const oldUrl = String(r.channel_url ?? "").trim();

    if (oldUrl === newUrl) {
      skipped++;
      continue;
    }

    const { error: uErr } = await admin
      .from("streamers")
      .update({ channel_url: newUrl })
      .eq("id", r.id);

    if (!uErr) updated++;
  }

  return NextResponse.json({
    ok: true,
    checked: list.length,
    updated,
    skipped,
  });
}