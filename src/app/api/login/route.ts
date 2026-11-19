import { NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "服务器还没设置 APP_PASSWORD" }, { status: 500 });
  }
  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "密码不对" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await expectedToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:", // 局域网是 http，不能强制 secure
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
