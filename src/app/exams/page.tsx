"use client";
import { useEffect, useState } from "react";
import { CATEGORIES, type Exam, type ExamResearch, type ResearchSource } from "@/lib/types";

const EMPTY = { name: "", short_name: "", category: "事业单位", subjects: "", exam_time: "", features: "", product: "", stage: "" };

function parseSources(v: unknown): ResearchSource[] {
  if (Array.isArray(v)) return v as ResearchSource[];
  try {
    return JSON.parse(String(v ?? "[]"));
  } catch {
    return [];
  }
}

export default function ExamsPage() {
  const [items, setItems] = useState<Exam[]>([]);
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [researching, setResearching] = useState(false);
  const [research, setResearch] = useState<(ExamResearch & { searched: number }) | null>(null);
  const [researchErr, setResearchErr] = useState("");

  const load = () => fetch("/api/exams").then((r) => r.json()).then((j) => setItems(j.items ?? []));
  useEffect(() => {
    load();
  }, []);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function runResearch() {
    if (!q.trim()) return;
    setResearching(true);
    setResearchErr("");
    setResearch(null);
    const r = await fetch("/api/exams/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: q }) });
    const j = await r.json();
    setResearching(false);
    if (!r.ok) return setResearchErr(j.error ?? "搜索失败");
    const d = j.draft;
    setResearch(d);
    setF({
      name: d.name,
      short_name: d.short_name,
      category: CATEGORIES.includes(d.category) ? d.category : "其他",
      subjects: d.subjects,
      exam_time: d.exam_time,
      features: d.features,
      stage: d.stage,
      product: f.product,
    });
  }

  async function save() {
    const r = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, sources: research?.sources ?? [], researched: !!research }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error);
    setMsg("✅ 已保存");
    setF(EMPTY);
    setResearch(null);
    setQ("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("删除这条考情？")) return;
    await fetch(`/api/exams/${id}`, { method: "DELETE" });
    load();
  }

  function edit(x: Exam) {
    setF({
      name: x.name,
      short_name: x.short_name ?? "",
      category: x.category,
      subjects: x.subjects ?? "",
      exam_time: x.exam_time ?? "",
      features: x.features ?? "",
      product: x.product ?? "",
      stage: x.stage ?? "",
    });
    setResearch(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[460px_1fr]">
      <section className="space-y-4">
        <div className="card space-y-3">
          <div className="h1">考情</div>
          <div className="rounded-xl bg-brand-soft p-4">
            <label className="mb-2 block text-sm font-bold text-brand">🔍 AI 搜索考情（推荐）</label>
            <div className="flex gap-2">
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runResearch()}
                placeholder="如：中国地震局 2027 事业单位招聘"
              />
              <button className="btn shrink-0" onClick={runResearch} disabled={researching || !q.trim()}>
                {researching ? "搜索中…" : "搜索整理"}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              {researching
                ? "正在联网搜索公告、大纲、往年经验，再交给 AI 整理，大约 30–60 秒…"
                : "自动搜公告、笔试大纲、时间节点，整理好填进下面的表单，判断当前阶段，并附上来源链接。写上年份和单位全称更准。"}
            </p>
            {researchErr && <div className="mt-2 text-sm text-brand">❌ {researchErr}</div>}
          </div>

          {research && (
            <div className="space-y-2 rounded-xl border border-line p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">AI 整理结果</span>
                <span className={`chip ${research.confidence === "高" ? "!bg-green-50 !text-green-700" : research.confidence === "低" ? "" : "!bg-amber-50 !text-amber-700"}`}>
                  可信度：{research.confidence || "未知"}
                </span>
                <span className="text-muted">参考了 {research.searched} 篇网页</span>
              </div>
              {research.warnings && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠️ 需要核实：{research.warnings}</div>}
              <div className="text-muted">请检查下面自动填好的内容，确认没问题再保存。来源：</div>
              <ul className="space-y-1">
                {research.sources.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                      {s.title}
                    </a>
                    <span className="text-muted">
                      {" "}
                      · {s.site ?? new URL(s.url).hostname}
                      {s.date ? ` · ${s.date}` : ""}
                      {s.used_for ? ` · ${s.used_for}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <div className="font-bold">{research ? "确认后保存" : "手动录入 / 修改"}</div>
          <p className="text-xs text-muted">生成笔记时，考试事实只从这里取。同名考试会覆盖更新。</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="label">考试全称 *</label>
              <input className="input" value={f.name} onChange={set("name")} placeholder="如：中国地震局 2027 年度事业单位公开招聘" />
            </div>
            <div>
              <label className="label">简称</label>
              <input className="input" value={f.short_name} onChange={set("short_name")} placeholder="地震局" />
            </div>
            <div>
              <label className="label">类别 *</label>
              <select className="input" value={f.category} onChange={set("category")}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">当前阶段（生成笔记时会按这个选方向）</label>
            <input className="input" value={f.stage} onChange={set("stage")} placeholder="如：笔试已考完，11 月 28 日查成绩" />
          </div>
          <div>
            <label className="label">笔试科目 / 题型</label>
            <textarea className="input h-28" value={f.subjects} onChange={set("subjects")} />
          </div>
          <div>
            <label className="label">时间节点</label>
            <textarea className="input h-28" value={f.exam_time} onChange={set("exam_time")} />
          </div>
          <div>
            <label className="label">考情特点 / 报考条件 / 坑点</label>
            <textarea className="input h-28" value={f.features} onChange={set("features")} />
          </div>
          <div>
            <label className="label">我们对应的资料</label>
            <textarea className="input h-16" value={f.product} onChange={set("product")} placeholder="如：真题 5 套 + 地震局专项常识 + 面试题本" />
          </div>
          <button className="btn w-full" onClick={save} disabled={!f.name}>
            保存
          </button>
          {msg && <div className="text-sm">{msg}</div>}
        </div>
      </section>

      <section className="space-y-3">
        {items.map((x) => {
          const sources = parseSources(x.sources);
          return (
            <div key={x.id} className="card space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold">
                  {x.name} <span className="chip ml-1">{x.category}</span>
                </div>
                <div className="flex shrink-0 gap-2 text-xs text-muted">
                  <button className="hover:text-ink" onClick={() => edit(x)}>
                    编辑
                  </button>
                  <button className="hover:text-brand" onClick={() => remove(x.id)}>
                    删除
                  </button>
                </div>
              </div>
              {x.stage && <div className="rounded bg-brand-soft px-2 py-1 text-sm text-brand">📍 {x.stage}</div>}
              {x.subjects && (
                <div className="whitespace-pre-wrap text-sm">
                  <span className="text-muted">科目：</span>
                  {x.subjects}
                </div>
              )}
              {x.exam_time && (
                <div className="whitespace-pre-wrap text-sm">
                  <span className="text-muted">时间：</span>
                  {x.exam_time}
                </div>
              )}
              {x.features && (
                <div className="whitespace-pre-wrap text-sm">
                  <span className="text-muted">特点：</span>
                  {x.features}
                </div>
              )}
              {x.product && (
                <div className="text-sm">
                  <span className="text-muted">资料：</span>
                  {x.product}
                </div>
              )}
              {sources.length > 0 && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer">
                    来源 {sources.length} 条{x.researched_at ? ` · AI 整理于 ${x.researched_at.slice(0, 16)}` : ""}
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    {sources.map((s, i) => (
                      <li key={i}>
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
        {!items.length && <div className="card text-sm text-muted">还没有考情。在左边输入考试名，点「搜索整理」试试。</div>}
      </section>
    </div>
  );
}
