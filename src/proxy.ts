import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, expectedToken } from "@/lib/auth";

// 内部工具：设置了 APP_PASSWORD 就要先输入团队密码；不设置就不需要登录（只在局域网用时可以不设）
export async function proxy(request: NextRequest) {
  if (!process.env.APP_PASSWORD) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (token && token === (await expectedToken())) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
