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

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const anon = supabaseAnon();
  const { data: userData } = await anon.auth.getUser(token);
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { notificationId, streamerId } = await req.json();

  const admin = supabaseAdmin();

  // 1) mark notification opened
  await admin
    .from("open_notifications")
    .update({ status: "opened" })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  // 2) log open event for cooldown
  await admin.from("auto_open_events").insert({
    user_id: user.id,
    streamer_id: streamerId,
    reason: "auto",
  });

  return NextResponse.json({ ok: true });
}