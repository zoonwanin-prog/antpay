import { NextResponse } from "next/server";
import { createSessionToken, hashPassword, safeEqual, SESSION_COOKIE } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

function text(value: unknown) {
  return String(value || "").trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = text(body.username);
    const password = text(body.password);
    if (!username || !password) {
      return NextResponse.json({ success: false, message: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("app_users")
      .select("username, password_hash, role")
      .eq("username", username)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const expectedHash = String(data?.password_hash || "");
    const envUsername = process.env.LOGIN_USERNAME;
    const envPassword = process.env.LOGIN_PASSWORD;
    const envLoginOk = envUsername && envPassword && safeEqual(username, envUsername) && safeEqual(password, envPassword);
    if ((!data || !expectedHash || !safeEqual(expectedHash, hashPassword(password))) && !envLoginOk) {
      return NextResponse.json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, createSessionToken(String(data?.username || username), String(data?.role || "admin")), {
      httpOnly: true,
      maxAge: 60 * 60 * 12,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "ไม่สามารถเข้าสู่ระบบได้" },
      { status: 500 }
    );
  }
}
