import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { AUTH_COOKIE, SESSION_DAYS, verifySession } from "@/lib/auth";
import { get } from "@/lib/db";

export interface User {
  id: string;
  name: string;
  role: "admin" | "staff";
  active: number;
}

/** 密码只存加盐哈希 */
export function hashPassword(pwd: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(pwd, salt, 32).toString("hex")}`;
}

export function checkPassword(pwd: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(pwd, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 当前登录的人（账号被停用也算没登录） */
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const uid = await verifySession(token);
  if (!uid) return null;
  const u = get<User>("select id, name, role, active from users where id = ?", uid);
  return u && u.active ? u : null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "未登录或登录已过期，请重新登录");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "admin") throw new HttpError(403, "只有管理员能做这个操作");
  return u;
}

/** 接口里统一把 HttpError 转成对应的状态码 */
export function errorResponse(e: unknown) {
  const status = e instanceof HttpError ? e.status : 500;
  return Response.json({ error: (e as Error).message }, { status });
}

export function sessionCookie(req: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(req.url).protocol === "https:", // 局域网是 http，不能强制 secure
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  };
}
