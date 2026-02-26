import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

// GET: جلب الإعدادات
export async function GET(req: Request) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("system_settings").select("*").eq("id", 1).single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    auto_open_enabled: Boolean(data?.auto_open_enabled),
    auto_open_cooldown_minutes: Number(data?.auto_open_cooldown_minutes ?? 0),
  });
}

// POST: تحديث الإعدادات
export async function POST(req: Request) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const enabled = Boolean(body.auto_open_enabled);
  const cooldown = Math.max(0, Math.min(1440, Number(body.auto_open_cooldown_minutes ?? 0))); // 0..1440

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("system_settings")
    .update({ auto_open_enabled: enabled, auto_open_cooldown_minutes: cooldown })
    .eq("id", 1);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}