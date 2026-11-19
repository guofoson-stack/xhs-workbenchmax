import { NextResponse, connection } from "next/server";
import { AUTH_COOKIE, signSession } from "@/lib/auth";
import { get, newId, run } from "@/lib/db";
import { hashPassword, sessionCookie } from "@/lib/session";

const hasUsers = () => (get<{ n: number }>("select count(*) as n from users")?.n ?? 0) > 0;

/** 第一次使用：还没有任何账号时，创建管理员 */
export async function GET() {
  await connection();
  return NextResponse.json({ needSetup: !hasUsers() });
}

export async function POST(req: Request) {
  if (hasUsers()) return NextResponse.json({ error: "已经有管理员了，请直接登录" }, { status: 400 });
  const { name, password } = await req.json();
  const n = String(name ?? "").trim();
  if (!n) return NextResponse.json({ error: "请填姓名" }, { status: 400 });
  if (String(password ?? "").length < 4) return NextResponse.json({ error: "密码至少 4 位" }, { status: 400 });
  const id = newId();
  run("insert into users (id, name, password_hash, role) values (?,?,?, 'admin')", id, n, hashPassword(String(password)));
  // 以前没有账号时入库的数据，都算到管理员名下
  for (const t of ["notes", "generations", "exams"]) run(`update ${t} set created_by = ? where created_by is null`, id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await signSession(id), sessionCookie(req));
  return res;
}
