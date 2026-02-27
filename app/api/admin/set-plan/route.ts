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

const ALLOWED_PLANS = ["standard", "elite", "plus", "pro"] as const;
type PlanKey = (typeof ALLOWED_PLANS)[number];

function isPlan(v: any): v is PlanKey {
  return ALLOWED_PLANS.includes(String(v).toLowerCase() as PlanKey);
}

export async function POST(req: Request) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  // ✅ تأكد إن اللي ينادي هو أدمن
  const { data: me, error: meErr } = await admin
    .from("profiles")
    .select("id,is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr) return NextResponse.json({ ok: false, error: meErr.message }, { status: 500 });
  if (!me?.is_admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const targetUserId = String(body?.user_id ?? "").trim();
  const planRaw = body?.plan;
  const statusRaw = String(body?.status ?? "active").toLowerCase();

  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });
  }
  if (!isPlan(planRaw)) {
    return NextResponse.json(
      { ok: false, error: `plan must be one of: ${ALLOWED_PLANS.join(", ")}` },
      { status: 400 }
    );
  }

  // status: نخليها "active" للمدفوع و "free" أو "inactive" للمجاني (standard)
  const plan = String(planRaw).toLowerCase() as PlanKey;
  const status =
    plan === "standard"
      ? "free"
      : statusRaw === "trialing" || statusRaw === "active"
      ? statusRaw
      : "active";

  // اختياري: current_period_end بعيد لو حاب
  const farFuture = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString(); // ~10 years

  const { error: upErr } = await admin.from("subscriptions").upsert(
    {
      user_id: targetUserId,
      status,
      price_id: plan, // ✅ بدون Stripe: نخزن plan key هنا
      current_period_end: plan === "standard" ? null : farFuture,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, user_id: targetUserId, plan, status });
}