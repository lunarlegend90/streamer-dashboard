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

export async function POST(req: Request) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: prof } = await admin.from("profiles").select("is_admin,role").eq("id", user.id).maybeSingle();
  if (!isAdminProfileRow(prof)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const targetId = String(body?.user_id ?? "").trim();
  if (!targetId) return NextResponse.json({ ok: false, error: "user_id required" }, { status: 400 });

  const { error } = await admin
    .from("profiles")
    .update({ is_approved: true, approved_at: new Date().toISOString() })
    .eq("id", targetId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, user_id: targetId });
}