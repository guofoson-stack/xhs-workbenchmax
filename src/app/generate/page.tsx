"use client";
import { useEffect, useState } from "react";
import VersionCard from "@/components/VersionCard";
import { CATEGORIES, type Exam, type GeneratedVersion } from "@/lib/types";

export default function GeneratePage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [input, setInput] = useState("");
  const [category, setCategory] = useState("事业单位");
  const [count, setCount] = useState(3);
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [genId, setGenId] = useState<string | null>(null);
  const [versions, setVersions] = useState<GeneratedVersion[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [info, setInfo] = useState("");

  useEffect(() => {
    fetch("/api/exams").then((r) => r.json()).then((j) => setExams(j.items ?? []));
  }, []);

  async function run() {
    setLoading(true);
    setErr("");
    setVersions([]);
    setChosen(null);
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exam_id: examId || undefined, exam_input: input, category, count, extra }),
    });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return setErr(j.error ?? "生成失败");
    setGenId(j.id);
    setVersions(j.versions);
    setInfo(`参考了 ${j.used} 个积木${j.hasExam ? "" : "；⚠️ 这个考试没录考情，具体事实都没写，建议先去「考情」录入"}`);
  }

  async function save(patch: Record<string, unknown>) {
    if (!genId) return;
    await fetch(`/api/generations/${genId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  }

  const selected = exams.find((e) => e.id === examId);

  return (
    <div className="space-y-5">
      <section className="card space-y-3">
        <div className="h1">一键生成</div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px_100px]">
          <div>
            <label className="label">选已录入考情的考试</label>
            <select className="input" value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">— 不选，手动输入 —</option>
              {exams.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">或直接输入考试名</label>
            <input className="input" value={input} onChange={(e) => setInput(e.target.value)} disabled={!!examId} placeholder="如：地震局事业单位" />
          </div>
          <div>
            <label className="label">考试类别</label>
            <select className="input" value={selected?.category ?? category} onChange={(e) => setCategory(e.target.value)} disabled={!!selected}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">出几版</label>
            <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">额外要求（可空）</label>
          <input className="input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="如：用上岸学姐人设；重点突出面试；语气更急迫一点" />
        </div>
        <button className="btn" onClick={run} disabled={loading || (!examId && !input.trim())}>
          {loading ? "搭积木中…（约 30–60 秒）" : "生成"}
        </button>
        {err && <div className="text-sm text-brand">{err}</div>}
        {info && <div className="text-xs text-muted">{info}</div>}
      </section>

      {versions.map((v, i) => (
        <VersionCard
          key={i}
          v={v}
          index={i}
          chosen={chosen === i}
          onChange={(nv) => {
            const next = versions.map((x, idx) => (idx === i ? nv : x));
            setVersions(next);
            save({ versions: next });
          }}
          onChoose={() => {
            setChosen(i);
            save({ chosen: i, versions });
          }}
        />
      ))}
      {chosen !== null && (
        <div className="card text-sm text-muted">已记录选用版本 {chosen + 1}。发布后去「生成记录」回填链接和数据，效果好的积木会自动加分。</div>
      )}
    </div>
  );
}
