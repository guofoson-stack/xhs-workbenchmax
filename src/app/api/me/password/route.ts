import { NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { checkPassword, errorResponse, hashPassword, requireUser } from "@/lib/session";

/** 自己改密码 */
export async function POST(req: Request) {
  try {
    const u = await requireUser();
    const { old, next } = await req.json();
    const row = get<{ password_hash: string }>("select password_hash from users where id = ?", u.id)!;
    if (!checkPassword(String(old ?? ""), row.password_hash)) return NextResponse.json({ error: "原密码不对" }, { status: 400 });
    if (String(next ?? "").length < 4) return NextResponse.json({ error: "新密码至少 4 位" }, { status: 400 });
    run("update users set password_hash = ? where id = ?", hashPassword(String(next)), u.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
