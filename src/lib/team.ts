import "server-only";
import { readSettings } from "@/lib/config";
import { all, get } from "@/lib/db";

const dstr = (d: Date) => d.toLocaleDateString("sv-SE"); // 本地日期 YYYY-MM-DD
const addDays = (s: string, n: number) => {
  const d = new Date(s + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dstr(d);
};
const weekday = (s: string) => new Date(s + "T12:00:00").getDay();

export function quotaOf() {
  const s = readSettings();
  const today = dstr(new Date());
  return { daily: s.dailyQuota, days: s.quotaDays, today, isWorkday: s.quotaDays.includes(weekday(today)) };
}

export function todayCount(uid: string) {
  return get<{ n: number }>("select count(*) as n from notes where created_by = ? and review != 'rejected' and date(created_at) = date('now','localtime')", uid)?.n ?? 0;
}

interface U {
  id: string;
  name: string;
  role: "admin" | "staff";
  active: number;
  exempt: number;
  joined: string;
}

/** 团队看板：今天、本周（周一到周日）、本月 */
export function teamStats(weekOf?: string) {
  const q = quotaOf();
  const base = weekOf && /^\d{4}-\d{2}-\d{2}$/.test(weekOf) ? weekOf : q.today;
  const monday = addDays(base, -((weekday(base) + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const monthStart = q.today.slice(0, 8) + "01";

  const users = all<U>("select id, name, role, active, exempt, date(created_at) as joined from users order by role = 'admin', created_at");

  // 每人每天采集数（本周 + 本月一起取）
  const from = week[0] < monthStart ? week[0] : monthStart;
  const to = week[6] > q.today ? week[6] : q.today;
  const daily = all<{ uid: string; d: string; n: number }>(
    "select created_by as uid, date(created_at) as d, count(*) as n from notes where review != 'rejected' and date(created_at) between ? and ? group by 1, 2",
    from,
    to
  );
  const countOf = (uid: string, d: string) => daily.find((r) => r.uid === uid && r.d === d)?.n ?? 0;

  // 本月到今天为止的「应达标天数」
  const monthDays: string[] = [];
  for (let d = monthStart; d <= q.today; d = addDays(d, 1)) if (q.days.includes(weekday(d))) monthDays.push(d);

  const quality = all<{ uid: string; n: number; likes: number; collects: number }>(
    `select created_by as uid, count(*) as n, avg(coalesce(likes,0)) as likes, avg(coalesce(collects,0)) as collects
     from notes where review != 'rejected' and date(created_at) between ? and ? group by 1`,
    monthStart,
    q.today
  );
  // 本月被退回的篇数（看采集质量）
  const rejected = all<{ uid: string; n: number }>(
    "select created_by as uid, count(*) as n from notes where review = 'rejected' and date(created_at) between ? and ? group by 1",
    monthStart,
    q.today
  );
  const imitated = all<{ uid: string; n: number }>(
    "select n.created_by as uid, sum(coalesce(e.use_count,0)) as n from elements e join notes n on n.id = e.note_id group by 1"
  );
  const gens = all<{ uid: string; n: number }>(
    "select created_by as uid, count(*) as n from generations where date(created_at) between ? and ? group by 1",
    monthStart,
    q.today
  );

  const rows = users.map((u) => {
    const counted = !!u.active && !u.exempt; // 管理员也考核；停用或设为「不考核」的不计
    const monthCount = quality.find((r) => r.uid === u.id);
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      active: !!u.active,
      counted,
      today: { count: countOf(u.id, q.today), done: countOf(u.id, q.today) >= q.daily },
      // 账号建立之前的日子不考核
      week: week.map((d) => ({
        date: d,
        count: countOf(u.id, d),
        workday: q.days.includes(weekday(d)) && d >= u.joined,
        future: d > q.today,
      })),
      month: {
        count: monthCount?.n ?? 0,
        metDays: monthDays.filter((d) => d >= u.joined && countOf(u.id, d) >= q.daily).length,
        workdays: monthDays.filter((d) => d >= u.joined).length,
        avgLikes: Math.round(monthCount?.likes ?? 0),
        avgCollects: Math.round(monthCount?.collects ?? 0),
        imitated: imitated.find((r) => r.uid === u.id)?.n ?? 0,
        gens: gens.find((r) => r.uid === u.id)?.n ?? 0,
        rejected: rejected.find((r) => r.uid === u.id)?.n ?? 0,
      },
    };
  });

  const unassigned = get<{ n: number }>("select count(*) as n from notes where created_by is null")?.n ?? 0;
  const pending = pendingCount();
  return { quota: { daily: q.daily, days: q.days }, today: q.today, isWorkday: q.isWorkday, week, monthStart, rows, unassigned, pending };
}

export function pendingCount() {
  return get<{ n: number }>("select count(*) as n from notes where review = 'pending'")?.n ?? 0;
}
