import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { get } from "@/lib/db";
import { quotaOf, todayCount } from "@/lib/team";

/** 当前登录的人 + 今天的采集任务进度 */
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const q = quotaOf();
  const done = todayCount(u.id);
  let team: { size: number; done: number } | undefined;
  if (u.role === "admin") {
    const size = get<{ n: number }>("select count(*) as n from users where active = 1 and role = 'staff'")?.n ?? 0;
    const doneN =
      get<{ n: number }>(
        `select count(*) as n from (select u.id from users u join notes n on n.created_by = u.id
         where u.active = 1 and u.role = 'staff' and date(n.created_at) = date('now','localtime')
         group by u.id having count(*) >= ?)`,
        q.daily
      )?.n ?? 0;
    team = { size, done: q.daily > 0 ? doneN : size };
  }
  return NextResponse.json({ user: { id: u.id, name: u.name, role: u.role }, task: { done, target: q.daily, workday: q.isWorkday }, team });
}
