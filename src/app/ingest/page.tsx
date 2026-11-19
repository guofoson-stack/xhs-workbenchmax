"use client";
import { useEffect, useState } from "react";
import Stars from "@/components/Stars";
import { CATEGORIES, ELEMENT_LABELS, type DecomposeResult, type ElementDraft, type ElementType } from "@/lib/types";

const EMPTY = { url: "", title: "", body: "", cover_text: "", likes: "", collects: "", comments: "", published_at: "" };

export default function IngestPage() {
  const [f, setF] = useState(EMPTY);
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [res, setRes] = useState<DecomposeResult | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);

  // 支持直接 Ctrl+V 粘贴封面截图
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) pickCover(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function pickCover(file: File | null) {
    setCover(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function decompose() {
    setLoading(true);
    setMsg("");
    setRes(null);
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    if (cover) fd.append("cover", cover);
    const r = await fetch("/api/decompose", { method: "POST", body: fd });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return setMsg(j.error ?? "拆解失败");
    setRes(j.result);
    setCoverPath(j.coverPath);
  }

  function updateEl(i: number, patch: Partial<ElementDraft>) {
    if (!res) return;
    const elements = res.elements.map((e, idx) => (idx === i ? { ...e, ...patch } : e));
    setRes({ ...res, elements });
  }

  async function save() {
    if (!res) return;
    setSaving(true);
    const r = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note: {
          ...f,
          cover_path: coverPath,
          cover_text: res.cover_text,
          exam_name: res.exam_name,
          exam_category: res.exam_category,
          account_type: res.account_type,
          summary: res.summary,
        },
        elements: res.elements,
      }),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok) return setMsg(j.error ?? "入库失败");
    setMsg(`✅ 已入库，${j.count} 个积木`);
    setF(EMPTY);
    pickCover(null);
    setRes(null);
    setCoverPath(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-3">
        <div className="h1">入库拆解</div>
        <p className="text-xs text-muted">把爆款笔记的内容贴进来。封面截图可以直接 Ctrl+V 粘贴。</p>
        <div>
          <label className="label">笔记链接（用来去重）</label>
          <input className="input" value={f.url} onChange={set("url")} placeholder="https://www.xiaohongshu.com/explore/..." />
        </div>
        <div>
          <label className="label">标题 *</label>
          <input className="input" value={f.title} onChange={set("title")} />
        </div>
        <div>
          <label className="label">正文 *</label>
          <textarea className="input h-48" value={f.body} onChange={set("body")} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(["likes", "collects", "comments"] as const).map((k) => (
            <div key={k}>
              <label className="label">{{ likes: "点赞", collects: "收藏", comments: "评论" }[k]}</label>
              <input className="input" type="number" value={f[k]} onChange={set(k)} />
            </div>
          ))}
          <div>
            <label className="label">发布日期</label>
            <input className="input" type="date" value={f.published_at} onChange={set("published_at")} />
          </div>
        </div>
        <div>
          <label className="label">封面图</label>
          <input type="file" accept="image/*" onChange={(e) => pickCover(e.target.files?.[0] ?? null)} className="text-sm" />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="封面" className="mt-2 h-48 rounded-lg border border-line object-cover" />
          )}
        </div>
        <div>
          <label className="label">封面文字（可不填，AI 会从图里识别）</label>
          <input className="input" value={f.cover_text} onChange={set("cover_text")} />
        </div>
        <button className="btn w-full" onClick={decompose} disabled={loading || !f.title || !f.body}>
          {loading ? "AI 拆解中…（约 20 秒）" : "拆解"}
        </button>
        {msg && <div className="text-sm">{msg}</div>}
      </section>

      <section className="space-y-3">
        {!res ? (
          <div className="card text-sm text-muted">拆解结果会显示在这里。你可以修改、打分、删掉不要的积木，确认后再入库。</div>
        ) : (
          <>
            <div className="card space-y-3">
              <div className="font-bold">笔记信息</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">原考试</label>
                  <input className="input" value={res.exam_name} onChange={(e) => setRes({ ...res, exam_name: e.target.value })} />
                </div>
                <div>
                  <label className="label">考试类别</label>
                  <select className="input" value={res.exam_category} onChange={(e) => setRes({ ...res, exam_category: e.target.value })}>
                    {[res.exam_category, ...CATEGORIES.filter((c) => c !== res.exam_category)].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">账号人设</label>
                  <input className="input" value={res.account_type} onChange={(e) => setRes({ ...res, account_type: e.target.value })} />
                </div>
                <div>
                  <label className="label">封面文字</label>
                  <input className="input" value={res.cover_text} onChange={(e) => setRes({ ...res, cover_text: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">爆款原因</label>
                <textarea className="input h-16" value={res.summary} onChange={(e) => setRes({ ...res, summary: e.target.value })} />
              </div>
            </div>

            {res.elements.map((el, i) => (
              <div key={i} className="card space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="chip">{ELEMENT_LABELS[el.type as ElementType] ?? el.type}</span>
                    <input
                      className="rounded border border-transparent px-1 text-xs text-muted hover:border-line"
                      value={el.pattern ?? ""}
                      onChange={(e) => updateEl(i, { pattern: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Stars value={el.rating ?? 3} onChange={(v) => updateEl(i, { rating: v })} />
                    <button className="text-xs text-muted hover:text-brand" onClick={() => setRes({ ...res, elements: res.elements.filter((_, idx) => idx !== i) })}>
                      删除
                    </button>
                  </div>
                </div>
                <textarea className="input min-h-16" value={el.template} onChange={(e) => updateEl(i, { template: e.target.value })} />
                {el.detail && Object.keys(el.detail).length > 0 && (
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer">细节</summary>
                    <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(el.detail, null, 2)}</pre>
                  </details>
                )}
              </div>
            ))}
            <button className="btn w-full" onClick={save} disabled={saving}>
              {saving ? "入库中…" : `确认入库（${res.elements.length} 个积木）`}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
