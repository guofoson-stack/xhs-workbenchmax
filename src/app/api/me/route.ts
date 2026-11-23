import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { all, get } from "@/lib/db";
import { pendingCount, quotaOf, todayCount } from "@/lib/team";

/** 当前登录的人 + 今天的采集任务进度 */
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const q = quotaOf();
  const done = todayCount(u.id);
  let team: { size: number; done: number; members: number } | undefined;
  if (u.role === "admin") {
    const size = get<{ n: number }>("select count(*) as n from users where active = 1 and exempt = 0")?.n ?? 0;
    const doneN =
      get<{ n: number }>(
        `select count(*) as n from (select u.id from users u join notes n on n.created_by = u.id
         where u.active = 1 and u.exempt = 0 and n.review != 'rejected' and date(n.created_at) = date('now','localtime')
         group by u.id having count(*) >= ?)`,
        q.daily
      )?.n ?? 0;
    const members = get<{ n: number }>("select count(*) as n from users where active = 1")?.n ?? 0;
    team = { size, done: q.daily > 0 ? doneN : size, members };
  }
  // 员工：最近 3 天被退回的笔记（首页提醒重新找）；管理员：待审核篇数
  // 最近 3 天被退回的笔记（首页提醒重新找）
  const rejected = all<{ id: string; title: string; review_note: string | null; created_at: string }>(
    `select id, title, review_note, created_at from notes
     where created_by = ? and review = 'rejected' and reviewed_at >= datetime('now','localtime','-3 days')
     order by reviewed_at desc limit 5`,
    u.id
  );
  const pending = u.role === "admin" ? pendingCount() : (get<{ n: number }>("select count(*) as n from notes where created_by = ? and review = 'pending'", u.id)?.n ?? 0);
  return NextResponse.json({
    user: { id: u.id, name: u.name, role: u.role },
    task: { done, target: q.daily, workday: q.isWorkday, counted: !u.exempt },
    team,
    rejected,
    pending,
  });
}
