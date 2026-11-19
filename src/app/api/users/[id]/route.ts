import { NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { errorResponse, hashPassword, requireAdmin } from "@/lib/session";

/** 改名、重置密码、改角色、停用/启用（管理员） */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAdmin();
    const { id } = await ctx.params;
    const b = await req.json();
    const target = get<{ role: string }>("select role from users where id = ?", id);
    if (!target) return NextResponse.json({ error: "没有这个成员" }, { status: 404 });

    const admins = get<{ n: number }>("select count(*) as n from users where role = 'admin' and active = 1")?.n ?? 0;
    const losingAdmin = target.role === "admin" && (b.role === "staff" || b.active === false);
    if (losingAdmin && admins <= 1) return NextResponse.json({ error: "至少要保留一个管理员" }, { status: 400 });
    if (id === me.id && b.active === false) return NextResponse.json({ error: "不能停用自己" }, { status: 400 });

    if (typeof b.name === "string" && b.name.trim()) {
      if (get("select id from users where name = ? and id <> ?", b.name.trim(), id)) return NextResponse.json({ error: "这个姓名已经有了" }, { status: 400 });
      run("update users set name = ? where id = ?", b.name.trim(), id);
    }
    if (typeof b.password === "string") {
      if (b.password.length < 4) return NextResponse.json({ error: "密码至少 4 位" }, { status: 400 });
      run("update users set password_hash = ? where id = ?", hashPassword(b.password), id);
    }
    if (b.role === "admin" || b.role === "staff") run("update users set role = ? where id = ?", b.role, id);
    if (typeof b.active === "boolean") run("update users set active = ? where id = ?", b.active ? 1 : 0, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
