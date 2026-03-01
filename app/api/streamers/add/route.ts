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

type PlanKey = "standard" | "elite" | "plus" | "pro";

const PLAN_LIMITS: Record<PlanKey, number> = {
  standard: 30,
  elite: 100,
  plus: 200,
  pro: 300,
};

function resolvePlanFromSubscription(sub: any): PlanKey {
  const status = String(sub?.status ?? "").toLowerCase();
  const planKey = String(sub?.price_id ?? "").toLowerCase();

  if (planKey === "pro" || planKey === "plus" || planKey === "elite" || planKey === "standard") {
    const active = status === "active" || status === "trialing";
    return active ? (planKey as PlanKey) : "standard";
  }

  const active = status === "active" || status === "trialing";
  return active ? "elite" : "standard";
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

  // ✅ extra hardening
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

  // --- get plan ---
  const { data: subRow } = await admin
    .from("subscriptions")
    .select("status,price_id,current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  const plan = resolvePlanFromSubscription(subRow);
  const limit = PLAN_LIMITS[plan];

  // --- count current streamers ---
  const { count, error: cErr } = await admin
    .from("streamers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .ilike("platform", "kick");

  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });

  const current = Number(count ?? 0);
  if (current >= limit) {
    return NextResponse.json(
      {
        ok: false,
        error: `Plan limit reached (${current}/${limit}). Upgrade to add more streamers.`,
        plan,
        limit,
        current,
      },
      { status: 403 }
    );
  }

  // ✅ Normalize username and force canonical URL
  const finalUsername = normalizeKickUsernameFromUrlOrInput(username, channel_url_input);

  if (!finalUsername) {
    return NextResponse.json({ ok: false, error: "Invalid Kick username / URL (missing channel slug)" }, { status: 400 });
  }

  const canonicalUrl = buildCanonicalKickUrl(finalUsername);

  // --- insert ---
  const { error: iErr } = await admin.from("streamers").insert({
    user_id: user.id,
    platform: "kick",
    username: finalUsername,
    display_name,
    // ✅ store canonical (prevents duplicates like https://kick.com/)
    channel_url: canonicalUrl,
    is_enabled: true,
    last_status: "unknown",
  });

  if (iErr) {
    if ((iErr as any).code === "23505") {
      return NextResponse.json({ ok: false, error: "Streamer already exists." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, plan, limit, current: current + 1 });
}