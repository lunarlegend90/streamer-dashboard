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

function normalizeKickUsernameFromUrlOrInput(username: string, channelUrl: string) {
  let finalUsername = (username ?? "").trim();

  try {
    const u = new URL((channelUrl ?? "").trim());
    const slug = u.pathname.replace("/", "").trim();
    if (slug) finalUsername = slug;
  } catch {
    // ignore
  }

  finalUsername = finalUsername.replace(/^@+/, "").trim();
  return finalUsername.toLowerCase();
}

function buildCanonicalKickUrl(username: string) {
  const u = (username ?? "").trim().replace(/^@+/, "");
  return `https://kick.com/${u}`;
}

export async function POST(req: Request) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  // ✅ Admin only
  const { data: prof, error: pErr } = await admin
    .from("profiles")
    .select("is_admin,role")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
  if (!isAdminProfileRow(prof)) {
    return NextResponse.json({ ok: false, error: "Forbidden (admin only)" }, { status: 403 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const platform = String(body?.platform ?? "kick").toLowerCase();
  const username = String(body?.username ?? "");
  const display_name = body?.display_name ? String(body.display_name) : null;
  const channel_url_input = String(body?.channel_url ?? "");

  // Kick only
  if (platform !== "kick") {
    return NextResponse.json({ ok: false, error: "Kick only" }, { status: 400 });
  }

  if (!username.trim() || !channel_url_input.trim()) {
    return NextResponse.json({ ok: false, error: "username and channel_url are required" }, { status: 400 });
  }

  const finalUsername = normalizeKickUsernameFromUrlOrInput(username, channel_url_input);
  if (!finalUsername) {
    return NextResponse.json({ ok: false, error: "Invalid Kick username / URL (missing channel slug)" }, { status: 400 });
  }

  const canonicalUrl = buildCanonicalKickUrl(finalUsername);

  // ✅ Prevent duplicates in GLOBAL list
  const { data: existing, error: eErr } = await admin
    .from("streamers")
    .select("id")
    .eq("platform", "kick")
    .eq("username", finalUsername)
    .eq("is_global", true)
    .maybeSingle();

  if (eErr) return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });
  if (existing?.id) {
    return NextResponse.json({ ok: false, error: "Streamer already exists in global list." }, { status: 409 });
  }

  // ✅ Insert as GLOBAL
  const { error: iErr } = await admin.from("streamers").insert({
    user_id: user.id, // keep who added it (audit)
    is_global: true,  // ⭐ مهم
    platform: "kick",
    username: finalUsername,
    display_name,
    channel_url: canonicalUrl,
    is_enabled: true,
    last_status: "unknown",
  });

  if (iErr) return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}