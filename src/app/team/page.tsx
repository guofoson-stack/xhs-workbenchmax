"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/components/useMe";

interface Row {
  id: string;
  name: string;
  role: "admin" | "staff";
  active: boolean;
  counted: boolean;
  today: { count: number; done: boolean };
  week: { date: string; count: number; workday: boolean; future: boolean }[];
  month: { count: number; metDays: number; workdays: number; avgLikes: number; avgCollects: number; imitated: number; gens: number; rejected: number };
}
interface Team {
  quota: { daily: number; days: number[] };
  today: string;
  isWorkday: boolean;
  week: string[];
  monthStart: string;
  rows: Row[];
  unassigned: number;
  pending: number;
}

const WD = ["日", "一", "二", "三", "四", "五", "六"];
const wdOf = (d: string) => new Date(d + "T12:00:00").getDay();
const shift = (d: string, n: number) => {
  const x = new Date(d + "T12:00:00");
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString("sv-SE");
};
const fmtW = (n: number) => (n >= 10000 ? (n / 10000).toFixed(1) + "万" : String(n));

export default function TeamPage() {
  const me = useMe();
  const [t, setT] = useState<Team | null>(null);
  const [weekOf, setWeekOf] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/team" + (weekOf ? "?week=" + weekOf : ""));
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    setErr("");
    setT(j);
  }, [weekOf]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (me && me.user.role !== "admin") return <div className="card text-sm text-muted">团队看板只有管理员能看。</div>;
  if (err) return <div className="card text-sm text-brand">{err}</div>;
  if (!t) return <div className="text-sm text-muted">加载中…</div>;

  const staff = t.rows.filter((r) => r.counted);
  const done = staff.filter((r) => r.today.done);
  const notDone = staff.filter((r) => !r.today.done);
  const thisWeek = !weekOf || t.week.includes(t.today);
  const checking = t.isWorkday && t.quota.daily > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <div className="h1">团队看板</div>
        <span className="text-sm text-muted">
          {t.quota.daily > 0
            ? `指标：每人每天采集 ${t.quota.daily} 篇 · ${t.quota.days.length === 7 ? "每天" : "每周" + [...t.quota.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WD[d]).join("")}`
            : "考核已暂停"}
        </span>
      </div>

      {/* 今天 */}
      <div className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="font-bold">
            今天（{t.today.slice(5)} 周{WD[wdOf(t.today)]}）
            {checking ? (
              <span className={`ml-2 ${done.length === staff.length && staff.length ? "text-green-700" : "text-brand"}`}>
                {done.length}/{staff.length} 人完成
              </span>
            ) : (
              <span className="ml-2 text-sm font-normal text-muted">{t.quota.daily > 0 ? "今天不考核" : "考核已暂停"}</span>
            )}
          </div>
          {t.pending > 0 && (
            <Link href="/review" className="text-sm text-brand hover:underline">
              {t.pending} 篇待审核 ›
            </Link>
          )}
        </div>
        {!staff.length && <div className="text-sm text-muted">没有要考核的人，在下面「成员管理」里添加成员。</div>}
        {checking && staff.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs text-muted">❌ 还没完成（{notDone.length}）</div>
              <div className="flex flex-wrap gap-1.5">
                {notDone.map((r) => (
                  <span key={r.id} className="rounded-full bg-red-50 px-2.5 py-1 text-sm text-red-700">
                    {r.name} {r.today.count}/{t.quota.daily}
                  </span>
                ))}
                {!notDone.length && <span className="text-sm text-green-700">全员完成 🎉</span>}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs text-muted">✅ 已完成（{done.length}）</div>
              <div className="flex flex-wrap gap-1.5">
                {done.map((r) => (
                  <Link key={r.id} href={`/library?by=${r.id}`} className="rounded-full bg-green-50 px-2.5 py-1 text-sm text-green-800 hover:underline">
                    {r.name} {r.today.count}篇
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 周表 */}
      <div className="card space-y-3 overflow-x-auto">
        <div className="flex items-center gap-2">
          <div className="font-bold">
            {thisWeek ? "本周" : `${t.week[0].slice(5)} 那一周`}
          </div>
          <button className="btn-ghost px-2 py-0.5 text-sm" onClick={() => setWeekOf(shift(t.week[0], -7))}>
            ‹ 上一周
          </button>
          {!thisWeek && (
            <>
              <button className="btn-ghost px-2 py-0.5 text-sm" onClick={() => setWeekOf(shift(t.week[0], 7))}>
                下一周 ›
              </button>
              <button className="btn-ghost px-2 py-0.5 text-sm" onClick={() => setWeekOf("")}>
                回到本周
              </button>
            </>
          )}
        </div>
        <table className="w-full min-w-[560px] text-center text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-normal">成员</th>
              {t.week.map((d) => (
                <th key={d} className={`py-1 font-normal ${d === t.today ? "font-bold text-ink" : ""}`}>
                  周{WD[wdOf(d)]}
                  <div className="text-[10px]">{d.slice(5)}</div>
                </th>
              ))}
              <th className="py-1 font-normal">合计</th>
            </tr>
          </thead>
          <tbody>
            {t.rows
              .filter((r) => r.active)
              .map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-1.5 text-left">
                    <Link href={`/library?by=${r.id}`} className="hover:underline">
                      {r.name}
                    </Link>
                    {!r.counted && <span className="ml-1 text-xs text-muted">不考核</span>}
                  </td>
                  {r.week.map((c) => {
                    let cls = "text-muted";
                    let txt = c.count ? String(c.count) : "·";
                    if (c.future) txt = "";
                    else if (r.counted && c.workday) {
                      cls = c.count >= t.quota.daily ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700";
                      txt = String(c.count);
                    }
                    return (
                      <td key={c.date} className="p-0.5">
                        <div className={`rounded py-1 ${cls}`}>{txt}</div>
                      </td>
                    );
                  })}
                  <td className="font-bold">{r.week.reduce((a, c) => a + c.count, 0)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="text-xs text-muted">绿＝达标，红＝没达标，灰＝不考核的日子。被退回的不算数。点名字看这个人采集了哪些。</div>
      </div>

      {/* 本月 */}
      <div className="card space-y-3 overflow-x-auto">
        <div className="font-bold">本月（{t.monthStart.slice(5)} 至今）</div>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-normal">成员</th>
              <th className="py-1 text-right font-normal">采集篇数</th>
              <th className="py-1 text-right font-normal">达标天数</th>
              <th className="py-1 text-right font-normal" title="采集的爆款原笔记平均点赞 / 收藏，看找的爆款够不够爆">平均赞 / 藏</th>
              <th className="py-1 text-right font-normal" title="这个人采集的积木被生成借用的总次数，越高说明采得越有用">被模仿次数</th>
              <th className="py-1 text-right font-normal" title="被管理员退回的篇数，不算在采集篇数里">被退回</th>
              <th className="py-1 text-right font-normal">本月生成</th>
            </tr>
          </thead>
          <tbody>
            {t.rows
              .filter((r) => r.active)
              .map((r) => {
                const m = r.month;
                const rate = m.workdays ? m.metDays / m.workdays : 1;
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-1.5">{r.name}</td>
                    <td className="text-right">{m.count}</td>
                    <td className={`text-right ${r.counted ? (rate >= 1 ? "text-green-700" : rate < 0.6 ? "text-brand" : "") : "text-muted"}`}>
                      {r.counted ? `${m.metDays}/${m.workdays}` : "-"}
                    </td>
                    <td className="text-right">
                      {m.count ? `${fmtW(m.avgLikes)} / ${fmtW(m.avgCollects)}` : "-"}
                    </td>
                    <td className="text-right">{m.imitated}</td>
                    <td className={`text-right ${m.rejected ? "text-brand" : ""}`}>{m.rejected}</td>
                    <td className="text-right">{m.gens}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {t.unassigned > 0 && <div className="text-xs text-muted">另有 {t.unassigned} 篇是账号功能上线前入库的，不算在任何人名下。</div>}
      </div>

      <QuotaCard quota={t.quota} onSaved={load} />
      <Members myId={me?.user.id} onChanged={load} />
    </div>
  );
}

function QuotaCard({ quota, onSaved }: { quota: Team["quota"]; onSaved: () => void }) {
  const [daily, setDaily] = useState(quota.daily);
  const [days, setDays] = useState<number[]>(quota.days);
  const [msg, setMsg] = useState("");
  const dirty = daily !== quota.daily || [...days].sort().join() !== [...quota.days].sort().join();

  async function save() {
    const r = await fetch("/api/team/quota", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ daily, days }) });
    setMsg(r.ok ? "✅ 已保存" : (await r.json()).error);
    if (r.ok) onSaved();
  }

  return (
    <div className="card space-y-3">
      <div className="font-bold">指标设置</div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>每人每天采集</span>
        <input type="number" min={0} max={20} className="input w-20" value={daily} onChange={(e) => setDaily(Math.max(0, Number(e.target.value) || 0))} />
        <span>篇，考核日：</span>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <label key={d} className="flex items-center gap-1">
            <input type="checkbox" checked={days.includes(d)} onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))} />
            周{WD[d]}
          </label>
        ))}
        <button className="btn" disabled={!dirty} onClick={save}>
          保存
        </button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
      <div className="text-xs text-muted">填 0 就是暂停考核。管理员和员工一样考核；某个人不用考核，就在成员管理里点「设为不考核」。</div>
    </div>
  );
}

interface Member {
  id: string;
  name: string;
  role: "admin" | "staff";
  active: number;
  exempt: number;
  created_at: string;
}

function Members({ myId, onChanged }: { myId?: string; onChanged: () => void }) {
  const [list, setList] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [pwd, setPwd] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/users");
    if (r.ok) setList((await r.json()).items);
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function add() {
    setMsg("");
    const r = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password: pwd, role }) });
    if (!r.ok) return setMsg("❌ " + (await r.json()).error);
    setMsg(`✅ 已添加。把「姓名：${name.trim()}　密码：${pwd}」和工作台地址发给 TA。`);
    setName("");
    setPwd("");
    load();
    onChanged();
  }

  async function patch(id: string, body: Record<string, unknown>, ok?: string) {
    const r = await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return alert((await r.json()).error);
    if (ok) alert(ok);
    load();
    onChanged();
  }

  function resetPwd(m: Member) {
    const p = prompt(`给「${m.name}」设一个新密码（至少 4 位）`);
    if (p) patch(m.id, { password: p }, `已重置。新密码：${p}`);
  }

  function rename(m: Member) {
    const n = prompt("改成什么名字？", m.name);
    if (n && n.trim() !== m.name) patch(m.id, { name: n.trim() });
  }

  return (
    <div className="card space-y-3">
      <div className="font-bold">成员管理</div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-32" placeholder="姓名" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input w-36" placeholder="初始密码" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as "staff" | "admin")}>
          <option value="staff">员工</option>
          <option value="admin">管理员（能审核、删除）</option>
        </select>
        <button className="btn" disabled={!name.trim() || pwd.length < 4} onClick={add}>
          添加
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {list.map((m) => (
            <tr key={m.id} className={`border-t border-line ${m.active ? "" : "text-muted"}`}>
              <td className="py-2">
                {m.name}
                {m.id === myId && <span className="ml-1 text-xs text-muted">（我）</span>}
              </td>
              <td>{m.role === "admin" ? "管理员" : "员工"}</td>
              <td>
                {m.active ? "正常" : "已停用"}
                {!!m.active && !!m.exempt && <span className="ml-1 text-xs text-muted">· 不考核</span>}
              </td>
              <td className="text-xs text-muted">{m.created_at?.slice(0, 10)} 加入</td>
              <td className="space-x-3 text-right text-xs">
                <button className="hover:text-ink" onClick={() => rename(m)}>改名</button>
                <button className="hover:text-ink" onClick={() => resetPwd(m)}>重置密码</button>
                <button className="hover:text-ink" onClick={() => patch(m.id, { exempt: !m.exempt })}>
                  {m.exempt ? "恢复考核" : "设为不考核"}
                </button>
                {m.id !== myId && (
                  <>
                    <button className="hover:text-ink" onClick={() => patch(m.id, { role: m.role === "admin" ? "staff" : "admin" })}>
                      设为{m.role === "admin" ? "员工" : "管理员"}
                    </button>
                    <button className="hover:text-brand" onClick={() => patch(m.id, { active: !m.active })}>
                      {m.active ? "停用" : "恢复"}
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs text-muted">管理员和员工一样要完成每日采集，区别是管理员能审核、退回、删除爆款，能进团队和设置。员工离职点「停用」，TA 采集过的爆款还留在库里、记录也保留。</div>
    </div>
  );
}
