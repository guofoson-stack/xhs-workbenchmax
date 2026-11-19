import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";

/**
 * 登录拦截：只拦数据接口，页面本身不拦。
 * 页面打开后，导航栏发现没登录会跳到登录页，并带上完整地址（包括书签采集的 #xhs= 数据），
 * 登录完自动回到原页面，书签采集不会丢数据。
 */
const OPEN_API = new Set(["/api/login", "/api/logout", "/api/setup"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/") || OPEN_API.has(pathname)) return NextResponse.next();
  if (await verifySession(request.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.json({ error: "未登录或登录已过期，请重新登录" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
