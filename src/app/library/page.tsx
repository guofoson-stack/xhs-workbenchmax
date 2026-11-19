"use client";
import { useCallback, useEffect, useState } from "react";
import Stars from "@/components/Stars";
import { CATEGORIES, ELEMENT_LABELS, type ElementType } from "@/lib/types";

interface Item {
  id: string;
  type: ElementType;
  template: string;
  pattern: string | null;
  rating: number;
  use_count: number;
  heat: number;
  note_title: string;
  note_url: string | null;
  exam_category: string | null;
  exam_name: string | null;
}

export default function LibraryPage() {
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("heat");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ type, category, q, sort });
    const r = await fetch("/api/elements?" + sp);
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return setErr(j.error);
    setErr("");
    setItems(j.items);
  }, [type, category, q, sort]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/elements/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...body } : x)));
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
        <input className="input w-48" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜关键词" />
        <span className="text-xs text-muted">{loading ? "加载中…" : `${items.length} 条`}</span>
      </div>
      {err && <div className="card text-sm text-brand">{err}</div>}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((it) => (
          <div key={it.id} className="card space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="chip">{ELEMENT_LABELS[it.type]}</span>
                {it.pattern && <span className="text-xs text-muted">{it.pattern}</span>}
              </div>
              <Stars value={it.rating} onChange={(v) => patch(it.id, { rating: v })} />
            </div>
            <div className="whitespace-pre-wrap text-sm">{it.template}</div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="truncate">
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
