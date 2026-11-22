import "server-only";
import { all, db, get, run, tx } from "@/lib/db";
import { readSettings } from "@/lib/config";

/**
 * 销量雷达：安卓手机每晚搜小红书、按销量排序，把结果传到 GitHub 仓库的 data/ 文件夹。
 * 工作台在这里把这些文件拉回本地数据库，用「今天累计已售 − 上次累计已售」算出每天卖了多少。
 * 不经过任何海外数据库，同事打开工作台就能看。
 */

const SCHEMA = `
create table if not exists radar_snapshots (
  run_key text not null,
  keyword text not null,
  rank integer not null,
  day text not null,
  captured_at text not null,
  title text not null,
  store text,
  signal text,
  price real,
  sold integer,
  fuzzy integer default 0,
  primary key (run_key, keyword, rank)
);
create index if not exists radar_prod_idx on radar_snapshots(keyword, title, store, day);
create table if not exists radar_files (
  name text primary key,
  mode text,
  report text,
  items integer,
  synced_at text not null default (datetime('now','localtime'))
);
`;

declare global {
  var __radarReady: boolean | undefined;
  var __radarSync: { at: number; error: string; running?: Promise<void> } | undefined;
}

function ensure() {
  if (!globalThis.__radarReady) {
    db().exec(SCHEMA);
    globalThis.__radarReady = true;
  }
}

const SYNC_EVERY = 30 * 60 * 1000; // 最多 30 分钟去 GitHub 看一次

interface PhoneItem {
  kw: string;
  rank: number;
  title: string;
  store?: string;
  signal?: string;
  price?: number | null;
  sold?: number | null;
  fuzzy?: boolean;
  day?: string;
  t?: number;
}

/** 北京时间的日期 YYYY-MM-DD */
const cnDay = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
const normDay = (d: string | undefined, t: number | undefined) => {
  const m = d?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return cnDay(t ?? Date.now());
};

async function doSync() {
  ensure();
  const s = readSettings();
  const repo = s.radarRepo;
  if (!repo) throw new Error("还没填数据仓库：到「⚙️ 设置 → 销量雷达」填上");
  if (!s.radarToken) throw new Error("还没填 GitHub 令牌：到「⚙️ 设置 → 销量雷达」填上");
  const base = process.env.WORKBENCH_RADAR_API || "https://api.github.com"; // 测试时可以指向本地模拟服务器
  const api = `${base}/repos/${repo}/contents/`;
  const headers = { Authorization: `Bearer ${s.radarToken}`, "User-Agent": "xhs-workbench", "X-GitHub-Api-Version": "2022-11-28" };

  const lr = await fetch(api + "data", { headers: { ...headers, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(20000) });
  if (lr.status === 401 || lr.status === 403) throw new Error("GitHub 令牌不对或已过期，请到设置里换一个");
  if (lr.status === 404) throw new Error(`找不到仓库 ${repo} 的 data 文件夹（手机还没上传过，或令牌没有这个仓库的权限）`);
  if (!lr.ok) throw new Error(`读取 GitHub 失败（${lr.status}）`);
  const names = ((await lr.json()) as { name: string }[]).map((f) => f.name).filter((n) => n.endsWith(".json"));
  const done = new Set(all<{ name: string }>("select name from radar_files").map((r) => r.name));

  for (const name of names.filter((n) => !done.has(n)).sort()) {
    const r = await fetch(api + "data/" + encodeURIComponent(name), { headers: { ...headers, Accept: "application/vnd.github.raw+json" }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`下载 ${name} 失败（${r.status}）`);
    const d = (await r.json()) as { run?: string; mode?: string; report?: string[]; items?: PhoneItem[] };
    const runKey = d.run || name.replace(/\.json$/, "");
    const items = d.items ?? [];
    tx(() => {
      for (const i of items) {
        if (!i.kw || !i.title) continue;
        const t = i.t ?? Date.now();
        run(
          `insert or ignore into radar_snapshots (run_key, keyword, rank, day, captured_at, title, store, signal, price, sold, fuzzy)
           values (?,?,?,?,?,?,?,?,?,?,?)`,
          runKey, i.kw, i.rank, normDay(i.day, t), new Date(t).toISOString(), i.title, i.store ?? "", i.signal ?? "",
          i.price ?? null, i.sold ?? null, i.fuzzy ? 1 : 0
        );
      }
      run("insert or replace into radar_files (name, mode, report, items) values (?,?,?,?)", name, d.mode ?? "", (d.report ?? []).join("\n"), items.length);
    });
  }
}

/** 拉 GitHub 上的新数据。距上次不到 30 分钟就跳过（force 时强制）；同时只跑一个 */
export async function syncRadar(force = false) {
  ensure();
  const st = (globalThis.__radarSync ??= { at: 0, error: "" });
  if (st.running) return st.running;
  if (!force && Date.now() - st.at < SYNC_EVERY) return;
  st.running = doSync()
    .then(() => { st.error = ""; })
    .catch((e: Error) => { st.error = e.name === "TimeoutError" ? "连不上 GitHub（超时），先显示已有数据" : e.message; })
    .finally(() => { st.at = Date.now(); st.running = undefined; });
  return st.running;
}

export function syncStatus() {
  const st = globalThis.__radarSync;
  return { lastSync: st?.at ? new Date(st.at).toISOString() : null, syncError: st?.error ?? "" };
}

export interface RadarRow {
  keyword: string;
  title: string;
  store: string;
  signal: string;
  price: number | null;
  sold: number | null;
  fuzzy: number;
  rank: number;
  daily: number | null; // 平均每天卖出（和上一次有数据的那天比）
  hist: [string, number | null][]; // 近 14 天累计已售
}

export function radarDays() {
  ensure();
  return all<{ day: string; n: number }>(
    "select day, count(*) as n from (select distinct day, keyword, title, store from radar_snapshots) group by day order by day desc limit 90"
  );
}

/** 平均每天卖出。已售显示成「1.7万+」这种模糊数时，两天一样不代表没卖，算不出来就返回空 */
function dailyOf(sold: number | null, prev: number | null, gap: number | null, fuzzy: number) {
  if (sold == null || prev == null || !gap) return null;
  const d = Math.max(0, Math.round((sold - prev) / gap));
  return fuzzy && d === 0 ? null : d;
}

/** 某一天的榜单：每个商品当天最后一次的数据，加上和上一次有数据那天的差值 */
export function radarDay(day: string): RadarRow[] {
  ensure();
  const rows = all<RadarRow & { prev_sold: number | null; gap: number | null }>(
    `with d as (
       select keyword, title, store, signal, price, sold, fuzzy, rank, day,
              row_number() over (partition by keyword, title, store, day order by captured_at desc) as rn
       from radar_snapshots where day <= ?),
     d1 as (select * from d where rn = 1),
     w as (select d1.*,
                  lag(sold) over p as prev_sold,
                  julianday(day) - julianday(lag(day) over p) as gap
           from d1 window p as (partition by keyword, title, store order by day))
     select * from w where day = ? order by keyword, rank`,
    day, day
  );
  const hist = all<{ keyword: string; title: string; store: string; day: string; sold: number | null }>(
    `select keyword, title, store, day, max(sold) as sold from radar_snapshots
     where day between date(?, '-13 day') and ? group by keyword, title, store, day order by day`,
    day, day
  );
  const hmap = new Map<string, [string, number | null][]>();
  for (const h of hist) {
    const k = h.keyword + "\u0001" + h.title + "\u0001" + h.store;
    if (!hmap.has(k)) hmap.set(k, []);
    hmap.get(k)!.push([h.day.slice(5), h.sold]);
  }
  return rows.map(({ prev_sold, gap, ...r }) => ({
    ...r,
    daily: dailyOf(r.sold, prev_sold, gap, r.fuzzy),
    hist: hmap.get(r.keyword + "\u0001" + r.title + "\u0001" + r.store) ?? [],
  }));
}

export function radarRuns() {
  ensure();
  return all<{ name: string; mode: string; report: string; items: number }>("select name, mode, report, items from radar_files order by name desc limit 14");
}

export function radarCount() {
  ensure();
  return get<{ n: number }>("select count(*) as n from radar_snapshots")?.n ?? 0;
}
