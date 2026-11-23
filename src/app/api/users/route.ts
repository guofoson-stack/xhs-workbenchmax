import { NextResponse } from "next/server";
import { all, get, newId, run } from "@/lib/db";
import { errorResponse, hashPassword, requireAdmin, requireUser } from "@/lib/session";

/** 成员列表（登录即可看名字，用于爆款库「采集人」筛选；管理员多看创建时间） */
export async function GET() {
  try {
    const me = await requireUser();
    const cols = me.role === "admin" ? "id, name, role, active, exempt, created_at" : "id, name, role, active";
    return NextResponse.json({ items: all(`select ${cols} from users order by role = 'admin' desc, created_at`) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 新建成员（管理员） */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { name, password, role } = await req.json();
    const n = String(name ?? "").trim();
    if (!n) return NextResponse.json({ error: "请填姓名" }, { status: 400 });
    if (String(password ?? "").length < 4) return NextResponse.json({ error: "初始密码至少 4 位" }, { status: 400 });
    if (get("select id from users where name = ?", n)) return NextResponse.json({ error: "这个姓名已经有了" }, { status: 400 });
    run("insert into users (id, name, password_hash, role) values (?,?,?,?)", newId(), n, hashPassword(String(password)), role === "admin" ? "admin" : "staff");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
