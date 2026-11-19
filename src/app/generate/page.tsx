"use client";
import { useEffect, useState } from "react";
import VersionCard from "@/components/VersionCard";
import { parseInfo, targetScenes } from "@/lib/examInfo";
import { CATEGORIES, SCENES, type Exam, type GeneratedVersion } from "@/lib/types";

interface NoteItem {
  id: string;
  title: string;
  scene: string | null;
  heat: number;
  exam_category: string | null;
  element_count: number;
}

const MODE_OPTIONS = [
  { value: "imitate", label: "高度模仿", hint: "标题和封面保留原句式，只换考试信息；正文按原结构段落写" },
  { value: "structure", label: "结构借鉴", hint: "沿用标题公式和正文结构，说法自己换" },
  { value: "free", label: "自由发挥", hint: "只参考打法，自由写" },
];

export default function GeneratePage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [examId, setExamId] = useState("");
  const [input, setInput] = useState("");
  const [category, setCategory] = useState("事业单位");
  const [count, setCount] = useState(3);
  const [mode, setMode] = useState("imitate");
  const [scene, setScene] = useState("");
  const [noteId, setNoteId] = useState("");
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [genId, setGenId] = useState<string | null>(null);
  const [versions, setVersions] = useState<GeneratedVersion[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [info, setInfo] = useState("");

  useEffect(() => {
    fetch("/api/exams").then((r) => r.json()).then((j) => setExams(j.items ?? []));
    fetch("/api/notes").then((r) => r.json()).then((j) => setNotes((j.items ?? []).filter((n: NoteItem) => n.element_count > 0)));
  }, []);

  const selected = exams.find((e) => e.id === examId);
  // 按考情阶段自动推断的选题场景（选了考试才算，避免构建时取当前时间）
  const auto = selected ? targetScenes(parseInfo(selected.info)) : null;

  async function run() {
    setLoading(true);
    setErr("");
    setVersions([]);
    setChosen(null);
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exam_id: examId || undefined, exam_input: input, category, count, extra, mode, scene: scene || undefined, note_id: noteId || undefined }),
    });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return setErr(j.error ?? "生成失败");
    setGenId(j.id);
    setVersions(j.versions);
    const modeLabel = MODE_OPTIONS.find((m) => m.value === j.mode)?.label;
    setInfo(
      `选题场景：${j.scenes?.[0]}（${j.sceneReason}）· 模仿强度：${modeLabel}${j.hasExam ? "" : " · ⚠️ 这个考试没录考情，具体事实都没写，建议先去「考情」搜索整理"}`
    );
  }

  async function save(patch: Record<string, unknown>) {
    if (!genId) return;
    await fetch(`/api/generations/${genId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  }

  return (
    <div className="space-y-5">
      <section className="card space-y-3">
        <div className="h1">一键生成</div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px_100px]">
          <div>
            <label className="label">选已录入考情的考试</label>
            <select className="input" value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">— 不选，手动输入 —</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">或直接输入考试名</label>
            <input className="input" value={input} onChange={(e) => setInput(e.target.value)} disabled={!!examId} placeholder="如：地震局事业单位" />
          </div>
          <div>
            <label className="label">考试类别</label>
            <select className="input" value={selected?.category ?? category} onChange={(e) => setCategory(e.target.value)} disabled={!!selected}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">出几版</label>
            <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label">模仿强度</label>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              {MODE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-muted">{MODE_OPTIONS.find((m) => m.value === mode)?.hint}</div>
          </div>
          <div>
            <label className="label">选题场景</label>
            <select className="input" value={scene} onChange={(e) => setScene(e.target.value)} disabled={!!noteId}>
              <option value="">自动{auto ? `：${auto.scenes[0]}（${auto.reason}）` : "（按考情阶段判断）"}</option>
              {SCENES.filter((s) => s !== "其他").map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-muted">会优先挑这个场景的爆款来模仿</div>
          </div>
          <div>
            <label className="label">指定模仿</label>
            <select className="input" value={noteId} onChange={(e) => setNoteId(e.target.value)}>
              <option value="">自动搭配（每版挑一篇不同的爆款）</option>
              {notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}｜{n.scene ?? "未分类"}｜热度 {n.heat}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-muted">{noteId ? "几版都照这一篇写，切入角度不同" : "按场景、类别、评分、热度挑选"}</div>
          </div>
        </div>

        <div>
          <label className="label">额外要求（可空）</label>
          <input className="input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="如：用上岸学姐人设；重点突出面试；语气更急迫一点" />
        </div>
        <button className="btn" onClick={run} disabled={loading || (!examId && !input.trim())}>
          {loading ? "照着爆款写中…（约 30–90 秒）" : "生成"}
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
        <div className="card text-sm text-muted">已记录选用版本 {chosen + 1}。发布后去「生成记录」回填链接和数据，效果好的爆款会被更多地挑来模仿。</div>
      )}
    </div>
  );
}
