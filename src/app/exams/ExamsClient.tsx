"use client";
import { useEffect, useMemo, useState } from "react";
import { ExamInfoEditor, ExamInfoView } from "@/components/ExamInfo";
import { emptyInfo, fmtDate, parseInfo, progressOf, todayStr, type ExamInfo, type Phase } from "@/lib/examInfo";
import { CATEGORIES, type Exam } from "@/lib/types";

const EMPTY_BASE = { name: "", short_name: "", category: "事业单位", product: "" };
const STALE_DAYS = 14;

/** 旧版只有几段文字的考情，转成结构化格式方便继续编辑 */
function legacyToInfo(x: Exam): ExamInfo {
  const info = emptyInfo();
  if (x.subjects) info.subjects = x.subjects.split("\n").filter(Boolean).map((name) => ({ name, basis: "本届" }));
  if (x.exam_time) info.facts.push({ label: "时间", value: x.exam_time, basis: "本届" });
  if (x.features) info.facts.push({ label: "考情特点", value: x.features, basis: "本届" });
  if (x.stage) info.stageHint = x.stage;
  return info;
}
const infoOf = (x: Exam) => parseInfo(x.info) ?? legacyToInfo(x);

const PHASE_STYLE: Record<Phase, string> = {
  进行中: "bg-green-100 text-green-800",
  "7天内": "bg-red-100 text-red-700",
  待开始: "bg-blue-50 text-blue-700",
  待公布: "bg-amber-50 text-amber-700",
  已结束: "bg-gray-100 text-gray-500",
};
const PHASE_ORDER: Phase[] = ["进行中", "7天内", "待开始", "待公布", "已结束"];

const daysSince = (d?: string | null) => (d ? Math.floor((Date.now() - Date.parse(d.replace(" ", "T"))) / 86400000) : Infinity);

type Drawer = { mode: "view"; id: string } | { mode: "edit"; id?: string } | { mode: "preview" } | null;

export default function ExamsClient() {
  const [items, setItems] = useState<Exam[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 筛选
  const [kw, setKw] = useState("");
  const [cat, setCat] = useState("");
  const [phase, setPhase] = useState<Phase | "" | "stale" | "noPaper">("");
  const [showDone, setShowDone] = useState(false);
  const [sort, setSort] = useState<"next" | "updated" | "name">("next");
  // AI 搜索
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // 侧边栏
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [base, setBase] = useState(EMPTY_BASE);
  const [info, setInfo] = useState<ExamInfo>(emptyInfo());
  const [researched, setResearched] = useState(false);
  const [msg, setMsg] = useState("");
  // 粘贴资料补充 / 批量搜索
  const [suppOpen, setSuppOpen] = useState(false);
  const [suppText, setSuppText] = useState("");
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batchLog, setBatchLog] = useState<{ name: string; state: "等待" | "搜索中" | "完成" | "失败"; msg?: string }[]>([]);
  const batchRunning = batchLog.some((l) => l.state === "搜索中" || l.state === "等待");

  const load = () =>
    fetch("/api/exams")
      .then((r) => r.json())
      .then((j) => {
        setItems(j.items ?? []);
        setLoaded(true);
      });
  useEffect(() => {
    load();
  }, []);

  const today = todayStr();
  const rows = useMemo(
    () =>
      items.map((x) => {
        const xi = infoOf(x);
        const p = progressOf(xi, today);
        const updated = x.researched_at || x.updated_at || null;
        return { x, info: xi, p, updated, stale: daysSince(updated as string) > STALE_DAYS, noPaper: !xi.papers?.length };
      }),
    [items, today]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { stale: 0, noPaper: 0 };
    for (const r of rows) {
      c[r.p.phase] = (c[r.p.phase] ?? 0) + 1;
      if (r.stale && r.p.phase !== "已结束") c.stale++;
      if (r.noPaper && r.p.phase !== "已结束") c.noPaper++;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const k = kw.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (k && !`${r.x.name} ${r.x.short_name ?? ""}`.toLowerCase().includes(k)) return false;
      if (cat && r.x.category !== cat) return false;
      if (phase === "stale") return r.stale && r.p.phase !== "已结束";
      if (phase === "noPaper") return r.noPaper && r.p.phase !== "已结束";
      if (phase) return r.p.phase === phase;
      if (!showDone && r.p.phase === "已结束") return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.x.name.localeCompare(b.x.name, "zh");
      if (sort === "updated") return String(b.updated ?? "").localeCompare(String(a.updated ?? ""));
      const pa = PHASE_ORDER.indexOf(a.p.phase);
      const pb = PHASE_ORDER.indexOf(b.p.phase);
      if (pa !== pb) return pa - pb;
      return (a.p.daysToNext ?? 9999) - (b.p.daysToNext ?? 9999);
    });
    return list;
  }, [rows, kw, cat, phase, showDone, sort]);

  /* ---------- 动作 ---------- */

  async function runResearch(name = q, keepProduct = "") {
    if (!name.trim()) return;
    setBusy(true);
    setStatus("🔍 正在联网搜索公告、时间节点，同时搜往年题型题量（全网搜大纲、真题回忆、经验帖、机构文章），大约 40–90 秒…");
    const r = await fetch("/api/exams/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setStatus("❌ " + (j.error ?? "搜索失败"));
    const res = j.result;
    setBase({ name: res.name, short_name: res.short_name, category: CATEGORIES.includes(res.category) ? res.category : "其他", product: keepProduct });
    setInfo(res.info);
    setResearched(true);
    setDrawer({ mode: "preview" });
    setStatus(`✅ 整理好了：参考 ${res.searched} 篇网页（${res.fetched} 篇读了公告全文），可信度「${res.info.confidence || "未知"}」，在右侧检查后保存。`);
  }

  async function save() {
    const clean: ExamInfo = { ...info, tips: info.tips.map((t) => t.trim()).filter(Boolean) };
    const r = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, info: clean, sources: clean.sources ?? [], researched }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg("❌ " + j.error);
    await load();
    setMsg("");
    setStatus("");
    setQ("");
    setResearched(false);
    setDrawer(j.item?.id ? { mode: "view", id: j.item.id } : null);
  }

  /** 只补搜题型题量，合并进现有考情后给人确认 */
  async function fetchPapers(x: Exam) {
    setBusy(true);
    setStatus("🧮 正在搜往年题型题量：全网搜官方大纲、真题回忆、笔经经验帖、机构文章，大约 30–60 秒…");
    const r = await fetch("/api/exams/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: x.name, only: "papers" }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setStatus("❌ " + (j.error ?? "搜索失败"));
    const res = j.papers;
    const cur = infoOf(x);
    if (!res.papers.length) return setStatus(`😶 搜了 ${res.searched} 篇网页，没找到靠谱的题型题量。${res.warnings ? res.warnings + "。" : ""}可以把经验帖正文用「📋 粘贴资料补充」贴进来。`);
    const merged: ExamInfo = {
      ...cur,
      papers: res.papers,
      missing: cur.missing.filter((m) => !/题型|题量/.test(m)),
      warnings: [cur.warnings, res.warnings].filter(Boolean).join("；") || undefined,
      sources: [...(cur.sources ?? []), ...res.sources.filter((s: { url: string }) => !cur.sources?.some((c) => c.url === s.url))],
    };
    setBase({ name: x.name, short_name: x.short_name ?? "", category: x.category, product: x.product ?? "" });
    setInfo(merged);
    setResearched(false);
    setDrawer({ mode: "preview" });
    setStatus(`✅ 找到 ${res.papers.length} 个科目的题型题量（参考 ${res.searched} 篇，读了 ${res.fetched} 篇全文），检查后保存。`);
  }

  /** 粘贴经验帖 / 大纲 / 链接 → AI 合并进现有考情 → 给人确认 */
  async function runSupplement(x: Exam) {
    setBusy(true);
    setStatus("📋 正在读你贴的资料并合并进考情…");
    const r = await fetch("/api/exams/supplement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: x.name, info: infoOf(x), text: suppText }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setStatus("❌ " + (j.error ?? "整理失败"));
    setBase({ name: x.name, short_name: x.short_name ?? "", category: x.category, product: x.product ?? "" });
    setInfo(j.info);
    setResearched(false);
    setSuppOpen(false);
    setSuppText("");
    setDrawer({ mode: "preview" });
    setStatus(`✅ 合并好了${j.fetched ? `（读了 ${j.fetched} 个链接）` : ""}${j.failed?.length ? `，没抓到：${j.failed.join("、")}` : ""}。检查后保存。`);
  }

  /** 批量搜索：一行一个考试，挨个搜索并直接保存（可信度和来源都会记下，之后可以抽查） */
  async function runBatch() {
    const names = [...new Set(batchText.split("\n").map((t) => t.trim()).filter(Boolean))].slice(0, 30);
    if (!names.length) return;
    const log = names.map((name) => ({ name, state: "等待" as const }));
    setBatchLog(log);
    const update = (i: number, patch: Partial<(typeof batchLog)[number]>) => setBatchLog((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    for (let i = 0; i < names.length; i++) {
      update(i, { state: "搜索中" });
      try {
        const r = await fetch("/api/exams/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: names[i] }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "搜索失败");
        const res = j.result;
        const s = await fetch("/api/exams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: res.name,
            short_name: res.short_name,
            category: CATEGORIES.includes(res.category) ? res.category : "其他",
            product: "",
            info: res.info,
            sources: res.info.sources ?? [],
            researched: true,
          }),
        });
        if (!s.ok) throw new Error((await s.json()).error ?? "保存失败");
        update(i, { state: "完成", msg: `${res.name} · 可信度${res.info.confidence || "未知"} · ${res.info.papers?.length ? `题型 ${res.info.papers.length} 科` : "没找到题型"}` });
        load();
      } catch (e) {
        update(i, { state: "失败", msg: (e as Error).message });
      }
    }
  }

  function openEdit(x?: Exam) {
    if (x) {
      setBase({ name: x.name, short_name: x.short_name ?? "", category: x.category, product: x.product ?? "" });
      setInfo(infoOf(x));
    } else {
      setBase(EMPTY_BASE);
      setInfo(emptyInfo());
    }
    setResearched(false);
    setMsg("");
    setDrawer({ mode: "edit", id: x?.id });
  }

  async function remove(id: string) {
    if (!confirm("删除这条考情？")) return;
    await fetch(`/api/exams/${id}`, { method: "DELETE" });
    setDrawer(null);
    load();
  }

  const setB = (k: keyof typeof EMPTY_BASE) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setBase({ ...base, [k]: e.target.value });

  const current = drawer?.mode === "view" ? rows.find((r) => r.x.id === drawer.id) : null;

  /* ---------- 页面 ---------- */

  return (
    <div className="space-y-4">
      {/* 顶部：标题 + AI 搜索 + 手动录入 */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h1 mr-2">考情 {loaded && <span className="text-base font-normal text-muted">（{items.length}）</span>}</div>
          <div className="flex min-w-72 flex-1 gap-2">
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runResearch()}
              placeholder="🔍 AI 搜索考情：输入考试名，如「中国地震局 2027 事业单位招聘」"
            />
            <button className="btn shrink-0" onClick={() => runResearch()} disabled={busy || !q.trim()}>
              {busy ? "搜索中…" : "搜索整理"}
            </button>
          </div>
          <button className="btn-ghost" onClick={() => setBatchOpen(!batchOpen)}>
            📚 批量搜索
          </button>
          <button className="btn-ghost" onClick={() => openEdit()}>
            ＋ 手动录入
          </button>
        </div>
        {status && <div className="text-xs text-muted">{status}</div>}
        {batchOpen && (
          <div className="space-y-2 rounded-lg border border-line p-3">
            <div className="text-xs text-muted">
              一行一个考试名，一次最多 30 个。会挨个联网搜索（每个约 1 分钟）并直接保存，搜完在列表里点开抽查。搜索期间别关这个页面。
            </div>
            <textarea
              className="input h-28"
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={"中国南方电网2027年校园招聘\n国家电网2027年第一批高校毕业生招聘\n四川省2026年下半年事业单位公开招聘"}
              disabled={batchRunning}
            />
            <div className="flex items-center gap-2">
              <button className="btn" onClick={runBatch} disabled={batchRunning || !batchText.trim()}>
                {batchRunning ? `搜索中 ${batchLog.filter((l) => l.state === "完成" || l.state === "失败").length}/${batchLog.length}` : "开始批量搜索"}
              </button>
              <span className="text-xs text-muted">每个考试约 11 次搜索 + 6 次读网页，大约 1 毛钱</span>
            </div>
            {batchLog.length > 0 && (
              <ul className="space-y-0.5 text-sm">
                {batchLog.map((l, i) => (
                  <li key={i}>
                    {l.state === "完成" ? "✅" : l.state === "失败" ? "❌" : l.state === "搜索中" ? "⏳" : "·"} {l.name}
                    {l.msg && <span className="ml-2 text-xs text-muted">{l.msg}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 统计：点一下直接筛 */}
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ["进行中", "报名等进行中"],
              ["7天内", "7 天内有节点"],
              ["待开始", "待开始"],
              ["待公布", "时间待公布"],
              ["已结束", "已结束"],
            ] as [Phase, string][]
          ).map(([ph, label]) => (
            <button
              key={ph}
              onClick={() => setPhase(phase === ph ? "" : ph)}
              className={`rounded-full px-3 py-1 ${phase === ph ? "ring-2 ring-brand" : ""} ${PHASE_STYLE[ph]}`}
            >
              {label} <b>{counts[ph] ?? 0}</b>
            </button>
          ))}
          <button onClick={() => setPhase(phase === "stale" ? "" : "stale")} className={`rounded-full bg-white px-3 py-1 ring-1 ring-line ${phase === "stale" ? "ring-2 ring-brand" : ""}`}>
            超过 {STALE_DAYS} 天没更新 <b>{counts.stale}</b>
          </button>
          <button onClick={() => setPhase(phase === "noPaper" ? "" : "noPaper")} className={`rounded-full bg-white px-3 py-1 ring-1 ring-line ${phase === "noPaper" ? "ring-2 ring-brand" : ""}`}>
            缺题型题量 <b>{counts.noPaper}</b>
          </button>
        </div>
      </div>

      {/* 筛选条 */}
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-56" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜考试名称" />
        <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">全部类别</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="next">按下个节点（最紧急在前）</option>
          <option value="updated">按最近更新</option>
          <option value="name">按名称</option>
        </select>
        {!phase && (
          <label className="flex items-center gap-1 text-sm text-muted">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> 显示已结束
          </label>
        )}
        {(phase || kw || cat) && (
          <button className="text-sm text-muted underline" onClick={() => (setPhase(""), setKw(""), setCat(""))}>
            清除筛选
          </button>
        )}
        <span className="ml-auto text-xs text-muted">显示 {visible.length} 个</span>
      </div>

      {/* 列表 */}
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_110px] gap-3 border-b border-line bg-paper px-4 py-2 text-xs text-muted md:grid">
          <span>考试</span>
          <span>当前阶段</span>
          <span>下一个节点</span>
          <span>更新</span>
        </div>
        {visible.map(({ x, info: xi, p, updated, stale }) => (
          <button
            key={x.id}
            onClick={() => setDrawer({ mode: "view", id: x.id })}
            className={`grid w-full grid-cols-1 gap-1 border-b border-line px-4 py-2 text-left text-sm last:border-0 hover:bg-brand-soft/40 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_110px] md:items-center md:gap-3 ${
              drawer && "id" in drawer && drawer.id === x.id ? "bg-brand-soft/60" : ""
            } ${p.phase === "已结束" ? "opacity-60" : ""}`}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {x.short_name && !x.name.includes(x.short_name) ? `${x.short_name}｜` : ""}
                {x.name}
              </span>
              <span className="text-xs text-muted">
                {x.category}
                {xi.cycle ? ` · ${xi.cycle}` : ""}
                {xi.confidence ? ` · 可信度${xi.confidence}` : ""}
                {xi.papers?.length ? "" : <span className="text-amber-700"> · 缺题型题量</span>}
              </span>
            </span>
            <span>
              <span className={`rounded px-2 py-0.5 text-xs ${PHASE_STYLE[p.phase]}`}>{p.label}</span>
            </span>
            <span className="min-w-0 truncate text-muted">
              {p.next ? (
                <>
                  <b className="text-ink">{fmtDate(p.next.date)}</b> {p.next.event}
                  <span className={`ml-1 text-xs ${p.daysToNext! <= 7 ? "text-red-600" : ""}`}>
                    {p.daysToNext === 0 ? "（今天）" : `（还有 ${p.daysToNext} 天）`}
                  </span>
                </>
              ) : (
                "—"
              )}
            </span>
            <span className={`text-xs ${stale && p.phase !== "已结束" ? "text-amber-700" : "text-muted"}`}>
              {updated ? String(updated).slice(5, 10).replace("-", "/") : "—"}
              {stale && p.phase !== "已结束" ? " 该更新了" : ""}
            </span>
          </button>
        ))}
        {loaded && !visible.length && (
          <div className="px-4 py-8 text-center text-sm text-muted">{items.length ? "没有符合筛选条件的考情" : "还没有考情，在上面输入考试名点「搜索整理」试试"}</div>
        )}
      </div>

      {/* 右侧抽屉 */}
      {drawer && (
        <>
          <div className="fixed inset-0 z-20 bg-black/20" onClick={() => setDrawer(null)} />
          <aside className="fixed right-0 top-0 z-30 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div className="font-bold">
                {drawer.mode === "view" ? "考情详情" : drawer.mode === "preview" ? "AI 整理结果（检查后保存）" : drawer.id ? "编辑考情" : "手动录入考情"}
              </div>
              <button className="text-xl leading-none text-muted hover:text-ink" onClick={() => setDrawer(null)} title="关闭">
                ×
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {drawer.mode === "view" && current && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold">{current.x.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        <span className="chip">{current.x.category}</span>
                        {current.info.cycle && <span className="chip !bg-gray-100 !text-gray-600">{current.info.cycle}</span>}
                        {current.info.confidence && <span className="chip !bg-gray-100 !text-gray-600">可信度 {current.info.confidence}</span>}
                        {current.x.researched_at && <span className="text-muted">AI 整理于 {current.x.researched_at.slice(0, 10)}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <a className="btn" href={`/generate?exam=${current.x.id}`}>
                        ✍️ 用这个考试生成
                      </a>
                      <button className="btn-ghost" onClick={() => openEdit(current.x)}>
                        编辑
                      </button>
                      <button className="btn-ghost" onClick={() => runResearch(current.x.name, current.x.product ?? "")} disabled={busy} title="重新联网搜索最新进展">
                        {busy ? "更新中…" : "🔄 更新"}
                      </button>
                      <button className="btn-ghost hover:text-brand" onClick={() => remove(current.x.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                  {busy && <div className="text-xs text-muted">{status}</div>}
                  {!busy && status && !current.info.papers?.length && <div className="text-xs text-muted">{status}</div>}
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-ghost text-sm" onClick={() => fetchPapers(current.x)} disabled={busy}>
                      🧮 {current.info.papers?.length ? "重新搜题型题量" : "搜题型题量"}
                    </button>
                    <button className="btn-ghost text-sm" onClick={() => setSuppOpen(!suppOpen)} disabled={busy}>
                      📋 粘贴资料补充
                    </button>
                  </div>
                  {suppOpen && (
                    <div className="space-y-2 rounded-lg border border-line p-3">
                      <div className="text-xs text-muted">
                        把经验帖、真题回忆、考试大纲、公告片段的<b>正文</b>贴进来（小红书的帖子要复制正文；其他网站的文章也可以直接贴链接），AI 会把新信息合并进现有考情，你确认后再保存。
                      </div>
                      <textarea className="input h-40" value={suppText} onChange={(e) => setSuppText(e.target.value)} placeholder="例：2025 年考的，综合知识 120 分钟，判断 40 道每道 0.6，单选 55 道……" />
                      <button className="btn" onClick={() => runSupplement(current.x)} disabled={busy || !suppText.trim()}>
                        {busy ? "整理中…" : "合并进考情"}
                      </button>
                    </div>
                  )}
                  <ExamInfoView info={current.info} />
                  {current.x.product && (
                    <div className="text-sm">
                      <span className="text-muted">我们的资料：</span>
                      {current.x.product}
                    </div>
                  )}
                </>
              )}

              {drawer.mode === "preview" && (
                <>
                  <div>
                    <div className="text-lg font-bold">{base.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <span className="chip">{base.category}</span>
                      {info.cycle && <span className="chip !bg-gray-100 !text-gray-600">{info.cycle}</span>}
                      {info.confidence && <span className="chip !bg-gray-100 !text-gray-600">可信度 {info.confidence}</span>}
                    </div>
                  </div>
                  <ExamInfoView info={info} />
                </>
              )}

              {drawer.mode === "edit" && (
                <>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr]">
                    <div className="col-span-2 md:col-span-1">
                      <label className="label">考试全称 *</label>
                      <input className="input" value={base.name} onChange={setB("name")} placeholder="中国地震局 2027 年度事业单位公开招聘" />
                    </div>
                    <div>
                      <label className="label">简称</label>
                      <input className="input" value={base.short_name} onChange={setB("short_name")} placeholder="地震局" />
                    </div>
                    <div>
                      <label className="label">类别</label>
                      <select className="input" value={base.category} onChange={setB("category")}>
                        {CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <ExamInfoEditor info={info} onChange={setInfo} />
                </>
              )}

              {(drawer.mode === "edit" || drawer.mode === "preview") && (
                <div>
                  <label className="label">我们对应的资料（生成笔记时会用到）</label>
                  <textarea className="input h-14" value={base.product} onChange={setB("product")} placeholder="如：真题 5 套 + 地震局专项常识 + 面试题本" />
                </div>
              )}
            </div>

            {(drawer.mode === "edit" || drawer.mode === "preview") && (
              <div className="flex items-center gap-2 border-t border-line px-5 py-3">
                <button className="btn flex-1" onClick={save} disabled={!base.name}>
                  保存
                </button>
                {drawer.mode === "preview" ? (
                  <button className="btn-ghost" onClick={() => setDrawer({ mode: "edit" })}>
                    ✏️ 修改
                  </button>
                ) : (
                  researched && (
                    <button className="btn-ghost" onClick={() => setDrawer({ mode: "preview" })}>
                      👀 看整理效果
                    </button>
                  )
                )}
                {msg && <span className="text-sm">{msg}</span>}
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
