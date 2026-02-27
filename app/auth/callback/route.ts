import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Supabase يرسل "code" في الرابط (PKCE)
  const code = url.searchParams.get("code");

  if (!code) {
    // بعض الحالات تجي بدون code
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: true } }
  );

  // يبدّل code إلى session داخل الكوكيز (على السيرفر)
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }

  // بعد تثبيت الجلسة نوديه لصفحة تعيين كلمة مرور
  return NextResponse.redirect(new URL("/auth/set-password", url.origin));
}