import { NextResponse } from "next/server";
import { AUTH_COOKIE, signSession } from "@/lib/auth";
import { get } from "@/lib/db";
import { checkPassword, sessionCookie } from "@/lib/session";

export async function POST(req: Request) {
  const { name, password } = await req.json().catch(() => ({}));
  const u = get<{ id: string; password_hash: string; active: number }>("select id, password_hash, active from users where name = ?", String(name ?? "").trim());
  if (!u || !checkPassword(String(password ?? ""), u.password_hash)) {
    return NextResponse.json({ error: "姓名或密码不对" }, { status: 401 });
  }
  if (!u.active) return NextResponse.json({ error: "这个账号已被停用，请联系管理员" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await signSession(u.id), sessionCookie(req));
  return res;
}
