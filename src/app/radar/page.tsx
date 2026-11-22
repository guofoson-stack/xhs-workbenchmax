"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Row {
  keyword: string;
  title: string;
  store: string;
  signal: string;
  price: number | null;
  sold: number | null;
  fuzzy: number;
  rank: number;
  daily: number | null;
  hist: [string, number | null][];
}
interface Data {
  days: { day: string; n: number }[];
  day: string | null;
  rows: Row[];
  runs: { name: string; mode: string; report: string; items: number }[];
  lastSync: string | null;
  syncError: string;
  error?: string;
}

const CATS: [string, RegExp][] = [
  ["教资", /教资|幼儿教资/],
  ["教招", /教招|教综|教育公共|学科专业|教育时政|教师编|特岗|幼师/],
  ["面试", /试讲|说课|答辩|结构化/],
  ["公考", /公务员|行测|申论|国考|省考|选调/],
  ["事业单位", /事业单位|三支一扶|社区|乡镇/],
  ["警察", /辅警|招警|警察|公安/],
  ["医疗", /医疗|护理|卫生|规培/],
  ["银行国企", /银行|国企|央企|农商|电网|烟草|铁路|邮政/],
  ["学历", /考研|专升本|四六级/],
];
const catOf = (k: string) => CATS.find((c) => c[1].test(k))?.[0] ?? "其他";

// 服饰鞋包等实物（标题里有这些词、又没有资料类字眼），默认不显示
const PHYS = /衬衫|衬衣|西装|西服|裤|裙|鞋|外套|上衣|T恤|毛衣|卫衣|马甲|领带|丝巾|耳环|项链|手提包|包包|正装|职业装|工作服|打底|内搭|发夹|皮带|手表|眼镜|口红|粉底/i;
const VIRT = /资料|电子版|PDF|逐字稿|课件|题库|网课|笔记|真题|教案|讲义|课程|直播课|录播|模板|音频|视频课|试讲稿|说课稿/i;
const isPhys = (r: Row) => /退货包运费/.test(r.signal) || (PHYS.test(r.title) && !VIRT.test(r.title));

const fmt = (n: number | null | undefined) => (n == null ? "–" : n >= 10000 ? `${(n / 10000).toFixed(n % 10000 ? 1 : 0)}万` : String(n));
const runTime = (name: string) => `${name.slice(4, 6)}-${name.slice(6, 8)} ${name.slice(9, 11)}:${name.slice(11, 13)}`;

function Chips({ list, on, pick }: { list: string[]; on: string; pick: (v: string) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {list.map((c) => (
        <button key={c} onClick={() => pick(c)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${c === on ? "border-brand bg-brand-soft text-brand" : "border-line bg-white text-muted"}`}>
          {c}
        </button>
      ))}
    </div>
  );
}

export default function RadarPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"rank" | "kw" | "runs">("rank");
  const [sort, setSort] = useState<"d" | "c">("d");
  const [cat, setCat] = useState("全部");
  const [kw, setKw] = useState("全部");
  const [phys, setPhys] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (opts: { day?: string; sync?: boolean } = {}) => {
    setLoading(true);
    const q = new URLSearchParams();
    if (opts.day) q.set("day", opts.day);
    if (opts.sync) q.set("sync", "1");
    const r = await fetch("/api/radar?" + q);
    const j = await r.json();
    setData(r.ok ? j : { days: [], day: null, rows: [], runs: [], lastSync: null, syncError: "", error: j.error });
    setLoading(false);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开页面时读取一次
    load();
  }, [load]);

  const view = useMemo(() => {
    const all = (data?.rows ?? []).map((r) => ({ ...r, cat: catOf(r.keyword), phys: isPhys(r) }));
    const cats = ["全部", ...new Set(all.map((r) => r.cat))];
    const c = cats.includes(cat) ? cat : "全部";
    const inCat = all.filter((r) => c === "全部" || r.cat === c);
    const hidden = inCat.filter((r) => r.phys).length;
    const shown = inCat.filter((r) => phys || !r.phys);
    const kws = ["全部", ...new Set(shown.map((r) => r.keyword))];
    const k = kws.includes(kw) ? kw : "全部";
    let rows = shown.filter((r) => k === "全部" || r.keyword === k).map((r) => ({ ...r, kws: [r.keyword] }));
    if (k === "全部") {
      // 同一商品出现在多个关键词里只算一次
      const m = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const id = r.title + "|" + r.store;
        const o = m.get(id);
        if (!o) m.set(id, r);
        else if (!o.kws.includes(r.keyword)) o.kws = [...o.kws, r.keyword];
      }
      rows = [...m.values()];
    }
    const hasDaily = rows.some((r) => r.daily != null);
    const by = sort === "d" && hasDaily ? "d" : "c";
    rows.sort((a, b) => (by === "d" ? (b.daily ?? -1) - (a.daily ?? -1) || (b.sold ?? 0) - (a.sold ?? 0) : (b.sold ?? -1) - (a.sold ?? -1)));
    const g = new Map<string, typeof shown>();
    for (const r of shown) g.set(r.keyword, [...(g.get(r.keyword) ?? []), r]);
    const kwTable = [...g.entries()]
      .map(([name, rs]) => ({
        name,
        cat: catOf(name),
        n: rs.length,
        d: rs.some((r) => r.daily != null) ? rs.reduce((s, r) => s + (r.daily ?? 0), 0) : null,
        sold: rs.reduce((s, r) => s + (r.sold ?? 0), 0),
        top: [...rs].sort((a, b) => (b.daily ?? b.sold ?? 0) - (a.daily ?? a.sold ?? 0))[0],
      }))
      .sort((a, b) => (b.d ?? -1) - (a.d ?? -1) || b.sold - a.sold);
    return { cats, c, kws, k, rows, hidden, hasDaily, by, kwTable, totalDaily: rows.reduce((s, r) => s + (r.daily ?? 0), 0) };
  }, [data, cat, kw, sort, phys]);

  if (!data) return <div className="card text-sm text-muted">加载中…（第一次打开会去 GitHub 拉数据，稍等几秒）</div>;

  const status = data.error
    ? `❌ ${data.error}`
    : data.syncError
      ? `⚠️ ${data.syncError}`
      : data.days.length
        ? `数据到 ${data.days[0].day.slice(5)}${data.runs[0] ? `，手机上次运行 ${runTime(data.runs[0].name)}` : ""}。手机每晚自动跑，这里每 30 分钟自动拉一次新数据。`
        : "还没有数据：手机跑完一次、上传到 GitHub 后，点「立即同步」。";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="h1">📈 销量雷达</div>
        <button className="btn-ghost" disabled={loading} onClick={() => load({ day: data.day ?? undefined, sync: true })}>
          {loading ? "同步中…" : "立即同步"}
        </button>
      </div>
      <p className={`text-xs ${data.error || data.syncError ? "text-brand" : "text-muted"}`}>{status}</p>

      <div className="flex gap-1 rounded-xl border border-line bg-white p-1">
        {(
          [
            ["rank", "商品排行"],
            ["kw", "关键词"],
            ["runs", "运行记录"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg py-2 text-sm ${tab === k ? "bg-brand font-medium text-white" : "text-muted"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab !== "runs" && (
        <div className="card space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto" value={data.day ?? ""} onChange={(e) => load({ day: e.target.value })}>
              {data.days.map((d) => (
                <option key={d.day} value={d.day}>
                  {d.day.slice(5)}（{d.n} 款）
                </option>
              ))}
            </select>
            {tab === "rank" && (
              <div className="inline-flex rounded-lg border border-line bg-paper p-0.5 text-sm">
                {(
                  [
                    ["d", "按日销量"],
                    ["c", "按累计已售"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} onClick={() => setSort(k)} className={`rounded-md px-3 py-1 ${sort === k ? "bg-white font-medium shadow-sm" : "text-muted"}`}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Chips list={view.cats} on={view.c} pick={(v) => { setCat(v); setKw("全部"); }} />
          {tab === "rank" && view.kws.length > 2 && <Chips list={view.kws} on={view.k} pick={setKw} />}
          <p className="text-xs text-muted">
            {!view.hasDaily && sort === "d" ? "目前只有一天的数据，先按累计已售排；第二天起自动算出每天卖了多少。" : "带「约」的商品已售显示为「x万+」，日销量只是估计。"}
            {view.hidden > 0 && (
              <button className="ml-1 text-brand" onClick={() => setPhys(!phys)}>
                {phys ? "隐藏" : "显示"}服饰等实物（{view.hidden} 款）
              </button>
            )}
          </p>
        </div>
      )}

      {tab === "rank" && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["监控商品", String(view.rows.length)],
              ["当日新增销量", view.hasDaily ? fmt(view.totalDaily) : "明天起"],
              ["关键词", String(new Set(view.rows.flatMap((r) => r.kws)).size)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-line bg-white px-3 py-2">
                <div className="text-xs text-muted">{l}</div>
                <div className="text-xl font-bold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <div className="card divide-y divide-line p-0">
            {view.rows.slice(0, 300).map((r, i) => {
              const id = r.title + "|" + r.store;
              const mx = Math.max(1, ...r.hist.map((h) => h[1] ?? 0));
              return (
                <div key={id} className="flex cursor-pointer gap-3 px-4 py-3" onClick={() => setOpen(open === id ? null : id)}>
                  <div className={`w-6 shrink-0 text-center font-bold tabular-nums ${i < 3 ? "text-brand" : "text-muted"}`}>{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-medium">{r.title}</div>
                    <div className="truncate text-xs text-muted">
                      {r.price != null && `¥${r.price} · `}
                      {r.store}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
                      {r.kws.map((k) => (
                        <span key={k} className="rounded bg-paper px-1.5">
                          {k}
                          {k === r.keyword ? `#${r.rank}` : ""}
                        </span>
                      ))}
                      {!!r.fuzzy && <span className="rounded bg-paper px-1.5">约</span>}
                      <span className="truncate">{r.signal}</span>
                    </div>
                    {open === id && (
                      <div className="mt-2 text-xs text-muted">
                        近 14 天累计已售：{r.hist.map((h) => `${h[0]} ${fmt(h[1])}`).join(" · ")}
                        {r.hist.length > 1 && (
                          <div className="mt-1 flex h-9 items-end gap-1">
                            {r.hist.map((h) => (
                              <i key={h[0]} title={h[0]} className="block flex-1 rounded-t bg-brand/75" style={{ height: `${Math.max(4, Math.round(((h[1] ?? 0) / mx) * 100))}%` }} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="w-20 shrink-0 text-right tabular-nums">
                    {view.by === "d" ? (
                      <>
                        <div className={`font-bold ${r.daily ? "text-green-700" : ""}`}>{r.daily != null ? `+${fmt(r.daily)}` : "–"}</div>
                        <div className="text-xs text-muted">
                          累计 {fmt(r.sold)}
                          {r.fuzzy ? "+" : ""}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-bold">
                          {fmt(r.sold)}
                          {r.fuzzy ? "+" : ""}
                        </div>
                        <div className="text-xs text-muted">{r.daily != null ? `当日 +${fmt(r.daily)}` : "已售"}</div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {!view.rows.length && <div className="p-6 text-center text-sm text-muted">这一天没有数据</div>}
          </div>
        </>
      )}

      {tab === "kw" && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-left font-normal">关键词</th>
                <th className="px-2 py-2 text-right font-normal">当日新增</th>
                <th className="px-2 py-2 text-right font-normal">前列累计</th>
                <th className="px-4 py-2 text-left font-normal">卖得最好</th>
              </tr>
            </thead>
            <tbody>
              {view.kwTable.map((x) => (
                <tr key={x.name} className="border-t border-line align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium">{x.name}</div>
                    <div className="text-xs text-muted">
                      {x.cat} · {x.n} 款
                    </div>
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${x.d ? "text-green-700" : ""}`}>{x.d == null ? "–" : `+${fmt(x.d)}`}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(x.sold)}</td>
                  <td className="px-4 py-2 text-xs text-muted">{x.top?.title.slice(0, 24)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!view.kwTable.length && <div className="p-6 text-center text-sm text-muted">这一天没有数据</div>}
        </div>
      )}

      {tab === "runs" && (
        <div className="card divide-y divide-line p-0">
          {data.runs.map((r) => (
            <div key={r.name} className="px-4 py-3">
              <div className="text-sm font-medium">
                {runTime(r.name)} <span className="chip ml-1">{r.mode === "full" ? "正式" : r.mode === "test" ? "试跑" : r.mode}</span>
                <span className="ml-2 text-xs text-muted">{r.items} 条</span>
              </div>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-muted">{r.report}</pre>
            </div>
          ))}
          {!data.runs.length && <div className="p-6 text-center text-sm text-muted">还没有运行记录</div>}
        </div>
      )}
    </div>
  );
}
