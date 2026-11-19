"use client";
import { useEffect, useState } from "react";
import { ExamInfoEditor, ExamInfoView } from "@/components/ExamInfo";
import { emptyInfo, parseInfo, type ExamInfo } from "@/lib/examInfo";
import { CATEGORIES, type Exam } from "@/lib/types";

const EMPTY_BASE = { name: "", short_name: "", category: "事业单位", product: "" };

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

export default function ExamsClient() {
  const [items, setItems] = useState<Exam[]>([]);
  const [base, setBase] = useState(EMPTY_BASE);
  const [info, setInfo] = useState<ExamInfo>(emptyInfo());
  const [researched, setResearched] = useState(false);
  const [mode, setMode] = useState<"none" | "preview" | "edit">("none");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const load = () => fetch("/api/exams").then((r) => r.json()).then((j) => setItems(j.items ?? []));
  useEffect(() => {
    load();
  }, []);

  async function runResearch(name = q) {
    if (!name.trim()) return;
    setBusy(true);
    setStatus("🔍 正在联网搜索公告、大纲、时间节点，并读取公告全文，大约 30–60 秒…");
    const r = await fetch("/api/exams/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setStatus("❌ " + (j.error ?? "搜索失败"));
    const res = j.result;
    setBase((b) => ({
      name: res.name,
      short_name: res.short_name,
      category: CATEGORIES.includes(res.category) ? res.category : "其他",
      product: b.product,
    }));
    setInfo(res.info);
    setResearched(true);
    setMode("preview");
    setStatus(
      `✅ 整理好了：参考 ${res.searched} 篇网页（其中 ${res.fetched} 篇读了公告全文），可信度「${res.info.confidence || "未知"}」。检查下面的内容，没问题点保存。`
    );
  }

  async function save() {
    const clean: ExamInfo = { ...info, tips: info.tips.map((t) => t.trim()).filter(Boolean) };
    const r = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, info: clean, sources: clean.sources ?? [], researched }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error);
    setMsg("✅ 已保存");
    setTimeout(() => setMsg(""), 2000);
    reset();
    load();
  }

  function reset() {
    setBase(EMPTY_BASE);
    setInfo(emptyInfo());
    setResearched(false);
    setStatus("");
    setQ("");
    setMode("none");
  }

  function edit(x: Exam) {
    setBase({ name: x.name, short_name: x.short_name ?? "", category: x.category, product: x.product ?? "" });
    setInfo(infoOf(x));
    setResearched(false);
    setStatus(`正在编辑「${x.name}」`);
    setMode("edit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function refresh(x: Exam) {
    setQ(x.name);
    window.scrollTo({ top: 0, behavior: "smooth" });
    await runResearch(x.name);
    setBase((b) => ({ ...b, product: x.product ?? "" }));
  }

  async function remove(id: string) {
    if (!confirm("删除这条考情？")) return;
    await fetch(`/api/exams/${id}`, { method: "DELETE" });
    load();
  }

  const setB = (k: keyof typeof EMPTY_BASE) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setBase({ ...base, [k]: e.target.value });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="space-y-4">
        <div className="card space-y-3">
          <div className="h1">考情</div>
          <div className="rounded-xl bg-brand-soft p-4">
            <label className="mb-2 block text-sm font-bold text-brand">🔍 AI 搜索考情</label>
            <div className="flex gap-2">
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runResearch()} placeholder="如：中国地震局 2027 事业单位招聘" />
              <button className="btn shrink-0" onClick={() => runResearch()} disabled={busy || !q.trim()}>
                {busy ? "搜索中…" : "搜索整理"}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">{status || "带上年份和单位全称更准。整理好会按「时间线 / 科目 / 关键信息」分开，本届和往年分开标注，当前阶段按今天自动判断。"}</p>
          </div>
        </div>

        {mode === "none" && (
          <button className="card w-full text-left text-sm text-muted hover:border-brand" onClick={() => setMode("edit")}>
            ✍️ 不用搜索，<b className="text-ink">手动录入</b>一个考情
          </button>
        )}

        {mode !== "none" && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-bold">{mode === "preview" ? "AI 整理结果（检查后保存）" : researched ? "修改 AI 整理结果" : "编辑考情"}</div>
              <div className="flex gap-3 text-xs">
                {mode === "preview" ? (
                  <button className="text-brand" onClick={() => setMode("edit")}>
                    ✏️ 修改
                  </button>
                ) : (
                  researched && (
                    <button className="text-brand" onClick={() => setMode("preview")}>
                      👀 看整理效果
                    </button>
                  )
                )}
                <button className="text-muted hover:text-brand" onClick={reset}>
                  取消
                </button>
              </div>
            </div>

            {mode === "preview" ? (
              <>
                <div>
                  <div className="font-bold">{base.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <span className="chip">{base.category}</span>
                    {info.cycle && <span className="chip !bg-gray-100 !text-gray-600">{info.cycle}</span>}
                    {info.confidence && <span className="chip !bg-gray-100 !text-gray-600">可信度 {info.confidence}</span>}
                  </div>
                </div>
                <ExamInfoView info={info} />
              </>
            ) : (
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

            <div>
              <label className="label">我们对应的资料（生成笔记时会用到）</label>
              <textarea className="input h-14" value={base.product} onChange={setB("product")} placeholder="如：真题 5 套 + 地震局专项常识 + 面试题本" />
            </div>
            <button className="btn w-full" onClick={save} disabled={!base.name}>
              保存
            </button>
          </div>
        )}
        {msg && <div className="card text-sm">{msg}</div>}
      </section>

      <section className="space-y-3">
        {items.map((x) => {
          const xi = infoOf(x);
          return (
            <div key={x.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold">{x.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <span className="chip">{x.category}</span>
                    {xi.cycle && <span className="chip !bg-gray-100 !text-gray-600">{xi.cycle}</span>}
                    {xi.confidence && <span className="chip !bg-gray-100 !text-gray-600">可信度 {xi.confidence}</span>}
                    {x.researched_at && <span className="text-muted">AI 整理于 {x.researched_at.slice(0, 10)}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 text-xs text-muted">
                  <button className="hover:text-ink" onClick={() => edit(x)}>
                    编辑
                  </button>
                  <button className="hover:text-ink" onClick={() => refresh(x)} title="重新联网搜索，获取最新进展">
                    🔄 更新
                  </button>
                  <button className="hover:text-brand" onClick={() => remove(x.id)}>
                    删除
                  </button>
                </div>
              </div>
              <ExamInfoView info={xi} compact />
              {x.product && (
                <div className="text-sm">
                  <span className="text-muted">我们的资料：</span>
                  {x.product}
                </div>
              )}
            </div>
          );
        })}
        {!items.length && <div className="card text-sm text-muted">还没有考情。在左边输入考试名，点「搜索整理」试试。</div>}
      </section>
    </div>
  );
}
