"use client";
import { useEffect, useState } from "react";
import Stars from "@/components/Stars";
import BookmarkInstall from "@/components/BookmarkInstall";

interface FetchedNoteLite {
  url: string;
  title: string;
  body: string;
  likes: number | null;
  collects: number | null;
  comments: number | null;
  published_at: string | null;
  cover: { dataUrl: string; mime: string } | null;
}
import { CATEGORIES, ELEMENT_LABELS, SCENES, type DecomposeResult, type ElementDraft, type ElementType } from "@/lib/types";

const EMPTY = { url: "", title: "", body: "", cover_text: "", likes: "", collects: "", comments: "", published_at: "" };

export default function IngestPage() {
  const [f, setF] = useState(EMPTY);
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [res, setRes] = useState<DecomposeResult | null>(null);
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");
  const [coverPath, setCoverPath] = useState<string | null>(null);

  // 书签采集：打开 /ingest#xhs=... 时自动导入并拆解（页面已经开着时也能接收）
  useEffect(() => {
    const take = () => {
      const h = window.location.hash;
      if (!h.startsWith("#xhs=")) return;
      history.replaceState(null, "", window.location.pathname);
      try {
        importFromBookmark(JSON.parse(decodeURIComponent(h.slice(5))));
      } catch {
        setFetchMsg("❌ 书签带过来的数据不完整，请回到笔记页面再点一次书签");
      }
    };
    take();
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 支持直接 Ctrl+V 粘贴封面截图
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.id === "xhs-link") return;
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

  async function decompose(fields = f, coverFile = cover) {
    setLoading(true);
    setMsg("");
    setRes(null);
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    if (coverFile) fd.append("cover", coverFile);
    const r = await fetch("/api/decompose", { method: "POST", body: fd });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return setMsg(j.error ?? "拆解失败");
    setRes(j.result);
    setCoverPath(j.coverPath);
  }

  /** 粘贴链接 → 自动抓取 → 自动拆解 */
  async function fetchAndDecompose(text = link) {
    if (!text.trim()) return;
    setFetching(true);
    setFetchMsg("正在抓取笔记…");
    setRes(null);
    setMsg("");
    const r = await fetch("/api/fetch-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const j = await r.json();
    setFetching(false);
    if (!r.ok) return setFetchMsg("❌ " + j.error);
    await applyFetched(j);
  }

  /** 书签采集过来的笔记（网址 #xhs=... 里带着数据） */
  async function importFromBookmark(raw: unknown) {
    setFetching(true);
    setFetchMsg("📌 收到书签采集的笔记，正在整理…");
    setRes(null);
    setMsg("");
    const r = await fetch("/api/import-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(raw),
    });
    const j = await r.json();
    setFetching(false);
    if (!r.ok) return setFetchMsg("❌ " + j.error);
    setLink(j.note.url);
    await applyFetched(j);
  }

  /** 把抓到的笔记填进表单，然后自动拆解 */
  async function applyFetched(j: { note: FetchedNoteLite; duplicate: boolean }) {
    const n = j.note;
    const fields = {
      ...EMPTY,
      url: n.url,
      title: n.title || "",
      body: n.body || "",
      likes: n.likes?.toString() ?? "",
      collects: n.collects?.toString() ?? "",
      comments: n.comments?.toString() ?? "",
      published_at: n.published_at ?? "",
    };
    setF(fields);
    let file: File | null = null;
    if (n.cover) {
      const blob = await (await fetch(n.cover.dataUrl)).blob();
      file = new File([blob], "cover." + (n.cover.mime.split("/")[1] || "jpg"), { type: n.cover.mime });
    }
    pickCover(file);

    const notes = [
      `✅ 抓到了：${n.title || "（无标题）"}`,
      n.likes == null ? "没抓到点赞收藏数，可以手动补" : "",
      !n.cover ? "没抓到封面，可以手动粘贴截图" : "",
      j.duplicate ? "⚠️ 这篇之前已经入过库了" : "",
    ].filter(Boolean);
    setFetchMsg(notes.join("　"));
    if (j.duplicate) return;
    if (!fields.title && !fields.body) return setFetchMsg(notes.join("　") + "　标题和正文都是空的，请手动补上再拆解");
    if (!fields.title) fields.title = fields.body.slice(0, 20);
    if (!fields.body) fields.body = fields.title;
    await decompose(fields, file);
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
          url: f.url || link,
          cover_path: coverPath,
          cover_text: res.cover_text,
          exam_name: res.exam_name,
          exam_category: res.exam_category,
          account_type: res.account_type,
          scene: res.scene,
          summary: res.summary,
        },
        elements: res.elements,
      }),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok) return setMsg(j.error ?? "入库失败");
    setMsg(`✅ 已入库，${j.count} 个积木。可以贴下一篇了`);
    setFetchMsg("");
    setLink("");
    setF(EMPTY);
    pickCover(null);
    setRes(null);
    setCoverPath(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-3">
        <div className="h1">入库拆解</div>
        <BookmarkInstall />
        <div className="rounded-xl bg-brand-soft p-4">
          <label className="mb-2 block text-sm font-bold text-brand">或者：粘贴小红书链接，自动抓取并拆解</label>
          <div className="flex gap-2">
            <input
              id="xhs-link"
              className="input"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text) {
                  e.preventDefault();
                  setLink(text);
                  fetchAndDecompose(text);
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && fetchAndDecompose()}
              placeholder="直接粘贴链接或整段分享口令，粘贴后自动开始"
            />
            <button className="btn shrink-0" onClick={() => fetchAndDecompose()} disabled={fetching || loading || !link.trim()}>
              {fetching ? "抓取中…" : loading ? "拆解中…" : "抓取并拆解"}
            </button>
          </div>
          {fetchMsg && <div className="mt-2 text-xs">{fetchMsg}</div>}
        </div>
        <p className="text-xs text-muted">下面的内容抓取后会自动填好，可以修改。抓不到时也可以手动填，封面截图直接 Ctrl+V 粘贴。</p>
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
        <button className="btn-ghost w-full" onClick={() => decompose()} disabled={loading || fetching || !f.title || !f.body}>
          {loading ? "AI 拆解中…（约 20 秒）" : "按下面的内容重新拆解"}
        </button>
        {msg && <div className="text-sm">{msg}</div>}
      </section>

      <section className="space-y-3">
        {!res ? (
          <div className="card text-sm text-muted">
            {loading ? "🤖 AI 正在拆解，大约 20–40 秒…" : "拆解结果会显示在这里。你可以修改、打分、删掉不要的积木，确认后再入库。"}
          </div>
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
                  <label className="label">场景（生成时按这个挑模仿对象）</label>
                  <select className="input" value={res.scene ?? ""} onChange={(e) => setRes({ ...res, scene: e.target.value })}>
                    <option value="">未分类</option>
                    {SCENES.map((c) => (
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
