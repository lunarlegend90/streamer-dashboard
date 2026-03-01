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

export async function GET(req: Request) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: prof } = await admin.from("profiles").select("is_admin,role").eq("id", user.id).maybeSingle();
  if (!isAdminProfileRow(prof)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { data, error } = await admin
    .from("profiles")
    .select("id,is_approved,approved_at,role,is_admin")
    .eq("is_approved", false)
    .order("id", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // bring auth emails
  const ids = (data ?? []).map((x: any) => x.id);
  const emails: Record<string, string | null> = {};

  // service role: can read auth users via admin API
  for (const id of ids) {
    const { data: u } = await admin.auth.admin.getUserById(id);
    emails[id] = u.user?.email ?? null;
  }

  const items = (data ?? []).map((p: any) => ({
    ...p,
    email: emails[p.id] ?? null,
  }));

  return NextResponse.json({ ok: true, items });
}