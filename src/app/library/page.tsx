"use client";
import { useCallback, useEffect, useState } from "react";
import Stars from "@/components/Stars";
import { CATEGORIES, ELEMENT_LABELS, SCENES, type ElementType } from "@/lib/types";

interface Item {
  id: string;
  type: ElementType;
  template: string;
  pattern: string | null;
  rating: number;
  use_count: number;
  heat: number;
  note_id: string;
  note_title: string;
  scene: string | null;
  note_url: string | null;
  exam_category: string | null;
  exam_name: string | null;
  collector: string | null;
  collector_id: string | null;
  review: string;
}

export default function LibraryPage() {
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("heat");
  const [scene, setScene] = useState("");
  const [by, setBy] = useState("");
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [untagged, setUntagged] = useState(0);
  const [tagging, setTagging] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ type, category, q, sort, scene, by });
    const r = await fetch("/api/elements?" + sp);
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return setErr(j.error);
    setErr("");
    setItems(j.items);
    fetch("/api/notes/tag-scenes").then((r) => r.json()).then((j) => setUntagged(j.untagged ?? 0));
  }, [type, category, q, sort, scene, by]);

  useEffect(() => {
    // 从团队看板点进来时带 ?by=某人
    const b = new URLSearchParams(location.search).get("by");
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => {
        setPeople(j.items);
        if (b) setBy(b);
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/elements/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...body } : x)));
  }

  async function setNoteScene(noteId: string, sc: string) {
    await fetch(`/api/notes/${noteId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene: sc }) });
    setItems((xs) => xs.map((x) => (x.note_id === noteId ? { ...x, scene: sc } : x)));
  }

  async function tagAll() {
    setTagging("AI 正在给旧素材补场景标签…");
    let left = untagged;
    let total = 0;
    while (left > 0) {
      const r = await fetch("/api/notes/tag-scenes", { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        setTagging("❌ " + j.error);
        return;
      }
      total += j.tagged;
      left = j.left;
      setTagging(`已补 ${total} 篇，还剩 ${left} 篇…`);
      if (!j.tagged) break;
    }
    setTagging(`✅ 补好了 ${total} 篇。标得不对可以在每张卡片上直接改。`);
    load();
  }

  async function remove(id: string) {
    if (!confirm("删除这个积木？")) return;
    await fetch(`/api/elements/${id}`, { method: "DELETE" });
    setItems((xs) => xs.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="h1 mr-4">爆款库</div>
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部类型</option>
          {Object.entries(ELEMENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">全部考试类别</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="heat">按热度</option>
          <option value="new">按最新</option>
        </select>
        <select className="input w-auto" value={scene} onChange={(e) => setScene(e.target.value)}>
          <option value="">全部场景</option>
          {SCENES.map((c) => (
            <option key={c}>{c}</option>
          ))}
          <option>未分类</option>
        </select>
        <select className="input w-auto" value={by} onChange={(e) => setBy(e.target.value)}>
          <option value="">全部采集人</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input className="input w-48" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜关键词" />
        <span className="text-xs text-muted">{loading ? "加载中…" : `${items.length} 条`}</span>
      </div>
      {err && <div className="card text-sm text-brand">{err}</div>}
      {(untagged > 0 || tagging) && (
        <div className="card flex flex-wrap items-center gap-3 text-sm">
          {untagged > 0 && !tagging.startsWith("✅") && (
            <>
              <span>🏷 有 {untagged} 篇爆款还没标「场景」，生成时没法按考试阶段挑选它们。</span>
              <button className="btn" onClick={tagAll} disabled={!!tagging && !tagging.startsWith("❌")}>
                一键补标签
              </button>
            </>
          )}
          {tagging && <span className="text-muted">{tagging}</span>}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((it) => (
          <div key={it.id} className="card space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="chip">{ELEMENT_LABELS[it.type]}</span>
                <select
                  className={`rounded-full border-0 px-2 py-0.5 text-xs ${it.scene ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}
                  value={it.scene ?? ""}
                  onChange={(e) => setNoteScene(it.note_id, e.target.value)}
                  title="这篇爆款的场景（改了会对同一篇的所有积木生效）"
                >
                  <option value="">未分类</option>
                  {SCENES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                {it.pattern && <span className="text-xs text-muted">{it.pattern}</span>}
              </div>
              <Stars value={it.rating} onChange={(v) => patch(it.id, { rating: v })} />
            </div>
            <div className="whitespace-pre-wrap text-sm">{it.template}</div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="truncate">
                {it.review === "pending" && <span className="mr-1 rounded bg-amber-100 px-1 text-amber-800">待审</span>}
                {it.collector ? `${it.collector}采集 · ` : ""}
                {it.exam_category ?? "-"} · 热度 {it.heat} · 用过 {it.use_count} 次 ·{" "}
                {it.note_url ? (
                  <a href={it.note_url} target="_blank" rel="noreferrer" className="underline">{it.note_title}</a>
                ) : (
                  it.note_title
                )}
              </span>
              <span className="flex shrink-0 gap-2">
                <button className="hover:text-ink" onClick={() => navigator.clipboard.writeText(it.template)}>复制</button>
                <button className="hover:text-brand" onClick={() => remove(it.id)}>删除</button>
              </span>
            </div>
          </div>
        ))}
      </div>
      {!loading && !items.length && !err && <div className="card text-sm text-muted">还没有积木，先去「入库拆解」攒几篇爆款。</div>}
    </div>
  );
}
