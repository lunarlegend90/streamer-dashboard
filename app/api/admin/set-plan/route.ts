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

const PLAN_LIMITS: Record<PlanKey, number> = {
  standard: 30,
  elite: 100,
  plus: 200,
  pro: 300,
};

function isPlan(v: any): v is PlanKey {
  return ALLOWED_PLANS.includes(String(v).toLowerCase() as PlanKey);
}

async function resolveUserId(admin: any, input: { user_id?: string; email?: string }) {
  const userId = String(input.user_id ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();

  if (userId) {
    // تأكد إن الـ UUID موجود في Auth
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    return data.user.id;
  }

  if (email) {
    // ابحث بالإيميل في Auth
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return null;
    const u = (data?.users ?? []).find((x: any) => String(x.email ?? "").toLowerCase() === email);
    return u?.id ?? null;
  }

  return null;
}

async function safeUpsertSubscription(
  admin: any,
  payload: {
    user_id: string;
    status: string;
    price_id: string | null;
    current_period_end: string | null;
    updated_at: string;
  }
) {
  // 1) جرّب update أول (ما يحتاج unique)
  const { data: updated, error: uErr } = await admin
    .from("subscriptions")
    .update(payload)
    .eq("user_id", payload.user_id)
    .select("user_id")
    .maybeSingle();

  if (uErr) return { ok: false as const, error: uErr };

  if (updated?.user_id) return { ok: true as const };

  // 2) إذا ما لقى صف، insert
  const { error: iErr } = await admin.from("subscriptions").insert(payload);
  if (iErr) return { ok: false as const, error: iErr };

  return { ok: true as const };
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

  const planRaw = body?.plan;
  const statusRaw = String(body?.status ?? "active").toLowerCase();

  if (!isPlan(planRaw)) {
    return NextResponse.json(
      { ok: false, error: `plan must be one of: ${ALLOWED_PLANS.join(", ")}` },
      { status: 400 }
    );
  }

  const plan = String(planRaw).toLowerCase() as PlanKey;

  // status: standard = free، الباقي = active/trialing
  const status =
    plan === "standard"
      ? "free"
      : statusRaw === "trialing" || statusRaw === "active"
      ? statusRaw
      : "active";

  // ✅ user_id أو email
  const targetUserId = await resolveUserId(admin, { user_id: body?.user_id, email: body?.email });
  if (!targetUserId) {
    return NextResponse.json(
      { ok: false, error: "Target user not found. Provide valid user_id or email." },
      { status: 404 }
    );
  }

  // اختياري: current_period_end بعيد (بدون Stripe)
  const farFuture = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString(); // ~10 years

  const payload = {
    user_id: targetUserId,
    status,
    price_id: plan, // ✅ نخزن plan key هنا
    current_period_end: plan === "standard" ? null : farFuture,
    updated_at: new Date().toISOString(),
  };

  const up = await safeUpsertSubscription(admin, payload);
  if (!up.ok) return NextResponse.json({ ok: false, error: up.error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    user_id: targetUserId,
    plan,
    status,
    plan_limit: PLAN_LIMITS[plan],
  });
}